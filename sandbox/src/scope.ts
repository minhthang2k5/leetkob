import { dockerCommand } from './docker';
import { sandboxScope } from './context';

export interface SandboxAttempt {
  submissionId: string;
  attempt: number;
}

export function withSandboxAttempt<T>(
  attempt: SandboxAttempt,
  signal: AbortSignal,
  run: () => Promise<T>
): Promise<T> {
  return sandboxScope.run({ ...attempt, signal }, run);
}

export async function cleanupSandboxAttempt(attempt: SandboxAttempt): Promise<void> {
  const ids = await dockerCommand([
    'ps',
    '--all',
    '--quiet',
    '--filter',
    'label=leetkob.sandbox=true',
    '--filter',
    `label=leetkob.submission=${attempt.submissionId}`,
    '--filter',
    `label=leetkob.attempt=${attempt.attempt}`
  ]);
  const containers = ids.split('\n').filter(Boolean);
  if (containers.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
    throw new Error('Invalid Docker container id');
  if (containers.length) {
    try {
      await dockerCommand(['rm', '--force', ...containers]);
    } catch (error) {
      // The original runner may have finished cleanup concurrently.
      if (
        await dockerCommand([
          'ps',
          '--all',
          '--quiet',
          '--filter',
          `label=leetkob.submission=${attempt.submissionId}`,
          '--filter',
          `label=leetkob.attempt=${attempt.attempt}`
        ])
      )
        throw error;
    }
  }
}

export async function listSandboxAttempts(): Promise<SandboxAttempt[]> {
  const labels = (
    await dockerCommand([
      'ps',
      '--all',
      '--filter',
      'label=leetkob.sandbox=true',
      '--format',
      '{{.Label "leetkob.submission"}} {{.Label "leetkob.attempt"}}'
    ])
  ).split('\n');
  const attempts = new Map<string, SandboxAttempt>();
  for (const label of labels) {
    const [submissionId, rawAttempt] = label.trim().split(/\s+/);
    const attempt = Number(rawAttempt);
    // Legacy/unscoped containers are not ours to reclaim from a worker.
    if (submissionId && Number.isSafeInteger(attempt) && attempt > 0) {
      attempts.set(`${submissionId}:${attempt}`, { submissionId, attempt });
    }
  }
  return [...attempts.values()];
}
