import { checkSubmission } from '@leetkob/checker';
import { judge } from '@leetkob/sandbox';
import type { CheckSubmissionFn, JudgeFn } from '@leetkob/shared';

/** What the worker calls. Tests pass fakes; production passes the real packages. */
export interface WorkerDeps {
  judge: JudgeFn;
  checkSubmission: CheckSubmissionFn;
}

export const defaultDeps: WorkerDeps = { judge, checkSubmission };
