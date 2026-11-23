import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { JudgeResult, Limits } from '@leetkob/shared';
import { sandboxScope } from './context';

export const SANDBOX_IMAGE = 'leetkob-sandbox:pa3';
export const SANDBOX_LABEL = 'leetkob.sandbox=true';
/** Contract A.1 rule 4: compiler work is not charged to the submitted program. */
export const COMPILATION_BUDGET = { cpuSeconds: 10, wallSeconds: 20 } as const;

export class SandboxInfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxInfrastructureError';
  }
}

/** Resolve only known installation paths; never search the caller's PATH. */
export function dockerExecutable(): string {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
          join(homedir(), 'AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe')
        ]
      : [
          '/usr/bin/docker',
          '/usr/local/bin/docker',
          '/opt/homebrew/bin/docker',
          '/snap/bin/docker'
        ];
  const executable = candidates.find((path) => existsSync(path));
  if (!executable)
    throw new SandboxInfrastructureError('Docker executable is unavailable');
  return executable;
}

export function containerArguments(
  name: string,
  limits: Limits,
  mode: 'compile' | 'run'
): string[] {
  return [
    'create',
    '--name',
    name,
    '--label',
    SANDBOX_LABEL,
    '--network',
    'none',
    '--user',
    '1000:1000',
    '--memory',
    `${limits.memoryMb}m`,
    '--memory-swap',
    `${limits.memoryMb}m`,
    '--pids-limit',
    String(limits.pids),
    '--cpus',
    '1',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--ulimit',
    `cpu=${limits.cpuSeconds}:${limits.cpuSeconds + 1}`,
    '--ulimit',
    'core=0:0',
    '--log-driver',
    'none',
    '--tmpfs',
    '/work:rw,exec,nosuid,nodev,size=64m,mode=1777',
    ...(sandboxScope.getStore()
      ? [
          '--label',
          `leetkob.submission=${sandboxScope.getStore()!.submissionId}`,
          '--label',
          `leetkob.attempt=${sandboxScope.getStore()!.attempt}`
        ]
      : []),
    '--interactive',
    SANDBOX_IMAGE,
    mode,
    String(limits.cpuSeconds)
  ];
}

/** Bounded control-plane output; never include raw Docker diagnostics in errors. */
export async function dockerCommand(args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerExecutable(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 1024 * 1024) chunks.push(chunk);
      else child.kill();
    });
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(new SandboxInfrastructureError('Docker is unavailable'));
    });
    child.on('close', (exit) => {
      clearTimeout(timer);
      if (exit !== 0 || timedOut || size > 1024 * 1024)
        reject(new SandboxInfrastructureError('Docker control command failed'));
      else resolve(Buffer.concat(chunks).toString('utf8').trim());
    });
  });
}

export interface ContainerOutcome {
  result: JudgeResult;
  stdout: Buffer;
  stderr: Buffer;
}

function classifyExit(
  mode: 'compile' | 'run',
  outputExceeded: boolean,
  wallExpired: boolean,
  state: { OOMKilled: boolean; ExitCode: number }
): JudgeResult {
  if (outputExceeded) return mode === 'compile' ? 'COMPILE_ERROR' : 'OUTPUT_LIMIT';
  if (wallExpired) return 'TIME_LIMIT';
  if (state.OOMKilled || state.ExitCode === 12) return 'MEMORY_LIMIT';
  if (state.ExitCode === 11) return 'TIME_LIMIT';
  if (state.ExitCode === 10) return 'COMPILE_ERROR';
  if (state.ExitCode === 13 || state.ExitCode >= 128) return 'RUNTIME_ERROR';
  if (state.ExitCode === 0) return 'ACCEPTED';
  throw new SandboxInfrastructureError('Trusted sandbox runner failed');
}

export async function runContainer(
  mode: 'compile' | 'run',
  artifact: Buffer,
  input: string,
  limits: Limits
): Promise<ContainerOutcome> {
  const name = `leetkob-${randomUUID()}`;
  const scope = sandboxScope.getStore();
  let abortCleanup: Promise<void> | undefined;
  const abort = () => {
    abortCleanup ??= dockerCommand(['rm', '--force', name]).then(
      () => {},
      () => {}
    );
  };
  let created = false;
  const cleanup = async () => {
    try {
      await dockerCommand(['rm', '--force', name]);
    } catch (error) {
      if (!scope?.signal.aborted) throw error;
    }
  };
  try {
    if (scope?.signal.aborted)
      throw new SandboxInfrastructureError('Sandbox attempt cancelled');
    await dockerCommand(containerArguments(name, limits, mode));
    created = true;
    scope?.signal.addEventListener('abort', abort, { once: true });
    if (scope?.signal.aborted)
      throw new SandboxInfrastructureError('Sandbox attempt cancelled');
    let wallExpired = false;
    let outputExceeded = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let capturedRunBytes = 0;
    // Executable bytes are an artifact, not compiler diagnostics or program output.
    const stdoutLimit = mode === 'compile' ? 32 * 1024 * 1024 : limits.outputBytes;
    let killPromise: Promise<string> | undefined;
    const kill = () => {
      killPromise ??= dockerCommand(['kill', name]);
      void killPromise.catch(() => {});
    };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        dockerExecutable(),
        ['start', '--attach', '--interactive', name],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );
      const timer = setTimeout(() => {
        wallExpired = true;
        kill();
      }, limits.wallSeconds * 1000);
      // Fallback also bounds a stuck Docker CLI after the container watchdog fired.
      const fallback = setTimeout(
        () => {
          child.kill();
          reject(new SandboxInfrastructureError('Docker attach did not finish'));
        },
        limits.wallSeconds * 1000 + 15_000
      );
      child.stdin.on('error', () => {}); // Early compile/run failure may close stdin.
      child.stdin.end(
        Buffer.concat([Buffer.from(`${artifact.length}\n`), artifact, Buffer.from(input)])
      );
      child.stdout.on('data', (chunk: Buffer) => {
        const remaining =
          mode === 'run'
            ? Math.max(0, limits.outputBytes - capturedRunBytes)
            : Math.max(0, stdoutLimit - stdoutSize);
        const kept = Math.min(remaining, chunk.length);
        if (kept) stdout.push(chunk.subarray(0, kept));
        capturedRunBytes += kept;
        stdoutSize += chunk.length;
        if (
          stdoutSize > stdoutLimit ||
          (mode === 'run' && stdoutSize + stderrSize > limits.outputBytes)
        ) {
          outputExceeded = true;
          kill();
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const remaining =
          mode === 'run'
            ? Math.max(0, limits.outputBytes - capturedRunBytes)
            : Math.max(0, limits.outputBytes - stderrSize);
        const kept = Math.min(remaining, chunk.length);
        if (kept) stderr.push(chunk.subarray(0, kept));
        capturedRunBytes += kept;
        stderrSize += chunk.length;
        if (
          stderrSize > limits.outputBytes ||
          (mode === 'run' && stdoutSize + stderrSize > limits.outputBytes)
        ) {
          outputExceeded = true;
          kill();
        }
      });
      child.on('error', () => {
        clearTimeout(timer);
        clearTimeout(fallback);
        reject(new SandboxInfrastructureError('Docker attach failed'));
      });
      child.on('close', () => {
        clearTimeout(timer);
        clearTimeout(fallback);
        resolve();
      });
    });
    if (killPromise) await killPromise.catch(() => {});
    if (scope?.signal.aborted)
      throw new SandboxInfrastructureError('Sandbox attempt cancelled');
    const state = JSON.parse(
      await dockerCommand(['inspect', '--format', '{{json .State}}', name])
    ) as {
      Running: boolean;
      ExitCode: number;
      OOMKilled: boolean;
      Error: string;
      Status: string;
    };
    if (state.Running || state.Error || state.Status !== 'exited')
      throw new SandboxInfrastructureError('Container execution failed');
    const result = classifyExit(mode, outputExceeded, wallExpired, state);
    return { result, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
  } finally {
    scope?.signal.removeEventListener('abort', abort);
    if (abortCleanup) await abortCleanup;
    if (created) await cleanup();
  }
}
