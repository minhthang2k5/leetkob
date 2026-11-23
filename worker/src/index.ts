import { checkSubmission } from '@leetkob/checker';
import { judge, cleanupSandboxAttempt, listSandboxAttempts } from '@leetkob/sandbox';
import type { CheckSubmissionFn, JudgeFn } from '@leetkob/shared';
import type { Lease } from './store';

export { SubmissionStore, LEASE_MS, MAX_ATTEMPTS } from './store';
export type { Lease, ClaimedJob } from './store';
export { createWorker } from './runner';
export type { WorkerOptions, WorkResult } from './runner';
export { isSampledPass } from './sampling';

/** What the worker calls. Tests pass fakes; production passes the real packages. */
export interface WorkerDeps {
  judge: JudgeFn;
  checkSubmission: CheckSubmissionFn;
  cleanupAttempt?: (lease: Lease) => Promise<void>;
  listAttempts?: () => Promise<Lease[]>;
}

export const defaultDeps: WorkerDeps = {
  judge,
  checkSubmission,
  cleanupAttempt: cleanupSandboxAttempt,
  listAttempts: listSandboxAttempts
};
