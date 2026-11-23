import type { JudgeFn, Limits } from '@leetkob/shared';

/** Default limits from docs/contract/pa3-interfaces.md, A.1. */
export const DEFAULT_LIMITS: Limits = {
  cpuSeconds: 2,
  wallSeconds: 5,
  memoryMb: 256,
  pids: 64,
  outputBytes: 64 * 1024
};

/** Placeholder until the sandbox runner exists (owner N1). */
export const judge: JudgeFn = async () => {
  throw new Error('judge() is not implemented yet');
};
