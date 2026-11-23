import type { CheckOptions, CheckResult } from '@leetkob/shared';
import { withSandboxAttempt } from '@leetkob/sandbox';
import { SubmissionStore, type ClaimedJob, type Lease } from './store';
import type { WorkerDeps } from './index';

export interface WorkerOptions {
  seed: string;
  checkOptions?: CheckOptions;
  labCapUsd?: number;
  heartbeatMs?: number;
  pollMs?: number;
  shutdownGraceMs?: number;
  onEvent?: (event: { type: string; submissionId?: string; attempt?: number }) => void;
}

export type WorkResult =
  { kind: 'idle' } | { kind: 'judged' | 'retry' | 'failed' | 'lost'; lease: Lease };

function validateChecks(job: ClaimedJob, checks: CheckResult): void {
  const expected = new Set(job.input.constraints.map((c) => c.id));
  if (checks.calls.length > 1 || checks.verdicts.length !== expected.size)
    throw new Error('Checker contract mismatch');
  for (const v of checks.verdicts) {
    const constraint = job.input.constraints.find((c) => c.id === v.constraintId);
    if (
      !constraint ||
      !expected.delete(v.constraintId) ||
      v.constraintCode !== constraint.code
    )
      throw new Error('Checker contract mismatch');
  }
  for (const call of checks.calls) {
    if (
      !Number.isFinite(call.costUsd) ||
      call.costUsd < 0 ||
      [call.inputTokens, call.outputTokens, call.ms].some(
        (n) => !Number.isSafeInteger(n) || n < 0
      )
    ) {
      throw new Error('Checker call log mismatch');
    }
  }
}

function abortAware<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new Error('Attempt cancelled'));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
    if (signal.aborted) abort();
  });
}

/** One active job per instance; another process can consume a different lab concurrently. */
export function createWorker(
  store: SubmissionStore,
  deps: WorkerDeps,
  options: WorkerOptions
) {
  const heartbeatMs = options.heartbeatMs ?? 15000;
  const pollMs = options.pollMs ?? 1000;
  const graceMs = options.shutdownGraceMs ?? 10000;
  const labCapUsd = options.labCapUsd ?? 3;
  const checkOptions = options.checkOptions ?? { modelOff: true };
  if (
    !options.seed ||
    ![heartbeatMs, pollMs, graceMs].every(Number.isSafeInteger) ||
    !Number.isFinite(labCapUsd) ||
    labCapUsd < 0 ||
    heartbeatMs <= 0 ||
    heartbeatMs >= 120000 ||
    pollMs <= 0 ||
    graceMs < 0
  )
    throw new Error('Invalid worker configuration');
  if (!checkOptions.modelOff && !checkOptions.judge)
    throw new Error('A SemanticJudge is required when modelOff is false');

  const emit = (type: string, lease?: Lease) => {
    try {
      options.onEvent?.({ type, ...lease });
    } catch {
      /* Observability must not change a job outcome. */
    }
  };

  async function reconcile(): Promise<void> {
    for (const lease of await store.recoverExpired()) await deps.cleanupAttempt?.(lease);
    if (deps.listAttempts && deps.cleanupAttempt) {
      for (const lease of await deps.listAttempts()) {
        if (!(await store.ownsLease(lease))) await deps.cleanupAttempt(lease);
      }
    }
  }

  async function runOnce(signal?: AbortSignal): Promise<WorkResult> {
    if (signal?.aborted) return { kind: 'idle' };
    for (const lease of await store.recoverExpired()) await deps.cleanupAttempt?.(lease);
    const job = await store.claim();
    if (!job) return { kind: 'idle' };
    const lease = { submissionId: job.submissionId, attempt: job.attempt };
    const controller = new AbortController();
    let lost = false;
    let heartbeat: Promise<void> | undefined;
    let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
    let stage = 'JUDGE_INFRASTRUCTURE_ERROR';
    const lose = () => {
      lost = true;
      controller.abort();
    };
    const tick = () => {
      if (heartbeat) return;
      heartbeat = store
        .heartbeat(lease)
        .then((owned) => {
          if (!owned) lose();
        }, lose)
        .finally(() => {
          heartbeat = undefined;
        });
    };
    const interval = setInterval(tick, heartbeatMs);
    const stop = () => {
      shutdownTimer ??= setTimeout(() => controller.abort(), graceMs);
    };
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    emit('claimed', lease);
    try {
      const outcome = await withSandboxAttempt(lease, controller.signal, () =>
        deps.judge(job.input.code, job.tests)
      );
      if (lost || !(await store.heartbeat(lease))) return { kind: 'lost', lease };
      if (controller.signal.aborted) throw new Error('Worker stopping');
      let checks: CheckResult = { verdicts: [], calls: [] };
      if (outcome.result === 'ACCEPTED') {
        stage = 'CHECKER_FAILURE';
        const labSpentUsd = await store.labSpend(job.labId);
        if (lost || !(await store.heartbeat(lease))) return { kind: 'lost', lease };
        if (controller.signal.aborted) throw new Error('Worker stopping');
        checks = await abortAware(
          deps.checkSubmission(job.input, {
            ...checkOptions,
            labSpentUsd,
            labCapUsd
          }),
          controller.signal
        );
        validateChecks(job, checks);
      }
      if (lost || !(await store.heartbeat(lease))) return { kind: 'lost', lease };
      if (controller.signal.aborted) throw new Error('Worker stopping');
      stage = 'PERSISTENCE_FAILURE';
      const finished = await store.finish(lease, outcome, checks, options.seed);
      emit(finished ? 'judged' : 'lost', lease);
      return { kind: finished ? 'judged' : 'lost', lease };
    } catch {
      if (lost) {
        emit('lost', lease);
        return { kind: 'lost', lease };
      }
      const changed = await store.fail(
        lease,
        controller.signal.aborted ? 'WORKER_STOPPED' : stage
      );
      const kind = changed ? (lease.attempt >= 3 ? 'failed' : 'retry') : 'lost';
      emit(kind, lease);
      return { kind, lease };
    } finally {
      clearInterval(interval);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      signal?.removeEventListener('abort', stop);
      if (heartbeat) await heartbeat;
    }
  }

  async function run(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await reconcile();
    while (!signal.aborted) {
      let result: WorkResult = { kind: 'idle' };
      try {
        result = await runOnce(signal);
      } catch {
        emit('infrastructure-error');
      }
      if (result.kind !== 'judged' && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, pollMs);
          signal.addEventListener('abort', done, { once: true });
          if (signal.aborted) done();
        });
      }
    }
  }
  return { runOnce, run, reconcile };
}
