import { AsyncLocalStorage } from 'node:async_hooks';

export const sandboxScope = new AsyncLocalStorage<{
  submissionId: string;
  attempt: number;
  signal: AbortSignal;
}>();
