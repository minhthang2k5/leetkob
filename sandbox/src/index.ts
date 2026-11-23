import type { JudgeFn, Limits } from '@leetkob/shared';
import { performance } from 'node:perf_hooks';
import { isUtf8 } from 'node:buffer';
import { COMPILATION_BUDGET, runContainer, SandboxInfrastructureError } from './docker';
import { outputsEqual } from './output';

export { SandboxInfrastructureError } from './docker';

/** Default limits from docs/contract/pa3-interfaces.md, A.1. */
export const DEFAULT_LIMITS: Limits = {
  cpuSeconds: 2,
  wallSeconds: 5,
  memoryMb: 256,
  pids: 64,
  outputBytes: 64 * 1024
};

/** Submission failures are outcomes; only Docker/runner failures are exceptions. */
export const judge: JudgeFn = async (code, tests, overrides = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`Invalid sandbox limit: ${key}`);
    }
  }
  const started = performance.now();
  let testsPassed = 0;
  const outcome = (
    result: import('@leetkob/shared').JudgeResult,
    compileOutput: string | null = null
  ) => ({
    result,
    testsPassed,
    testsTotal: tests.length,
    compileOutput,
    durationMs: Math.round(performance.now() - started)
  });
  const compiled = await runContainer('compile', Buffer.from(code), '', {
    ...limits,
    ...COMPILATION_BUDGET
  });
  if (compiled.result !== 'ACCEPTED') {
    return outcome(
      compiled.result,
      compiled.result === 'COMPILE_ERROR'
        ? compiled.stderr
            .subarray(0, 4096)
            .toString('utf8')
            .replace(/\uFFFD$/, '')
        : null
    );
  }
  if (compiled.stdout.length === 0) {
    throw new SandboxInfrastructureError('Compiler produced no executable');
  }
  for (const test of tests) {
    const run = await runContainer('run', compiled.stdout, test.input, limits);
    if (run.result !== 'ACCEPTED') return outcome(run.result);
    if (
      !isUtf8(run.stdout) ||
      !outputsEqual(run.stdout.toString('utf8'), test.expectedOutput)
    ) {
      return outcome('WRONG_ANSWER');
    }
    testsPassed++;
  }
  return outcome('ACCEPTED');
};
