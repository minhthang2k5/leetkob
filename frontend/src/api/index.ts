import { createHttpApi } from './http';
import { createMockApi } from './mock';
import type { Api } from './types';

const TOKEN_KEY = 'leetkob.token';

let memoryToken: string | null = null;

/** The session token is the only credential the browser holds. */
export const session = {
  get(): string | null {
    if (memoryToken) return memoryToken;
    try {
      memoryToken = sessionStorage.getItem(TOKEN_KEY);
    } catch {
      memoryToken = null;
    }
    return memoryToken;
  },
  set(token: string | null): void {
    memoryToken = token;
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage blocked: the token lives in memory for this tab only
    }
  }
};

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

// `npm run dev:mock` runs Vite with --mode mock; no env file needed.
export const isMock = import.meta.env.MODE === 'mock';

export const api: Api = isMock
  ? createMockApi(() => session.get())
  : createHttpApi(
      () => session.get(),
      () => unauthorizedListeners.forEach((fn) => fn())
    );

export * from './types';
export { ApiError, describeProblem } from './problem';
