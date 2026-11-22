import { ApiError, toProblem } from './problem';
import type {
  Api,
  Lab,
  LabSummary,
  Me,
  NewLab,
  PublishReceipt,
  ReviewDecision,
  ReviewQueue,
  Submission,
  User,
  Verdict
} from './types';

type TokenSource = () => string | null;

/**
 * The real client. It only talks to this site's own /v1 (same origin in dev through the
 * Vite proxy, and in production behind the same host), so no API key or backend secret
 * ever reaches the browser: the only credential here is the user's own session token.
 */
export function createHttpApi(getToken: TokenSource, onUnauthorized: () => void): Api {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(`/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ApiError(toProblem(0, null, `/v1${path}`));
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new ApiError(toProblem(res.status, data, `/v1${path}`));
      if (err.status === 401 && path !== '/auth/login') onUnauthorized();
      throw err;
    }
    return data as T;
  }

  const id = encodeURIComponent;

  return {
    login: (username, password) =>
      call<{ token: string; user: User }>('POST', '/auth/login', { username, password }),
    me: () => call<Me>('GET', '/me'),
    listLabs: (classId) => call<LabSummary[]>('GET', `/classes/${id(classId)}/labs`),
    createLab: (classId, lab: NewLab) =>
      call<Lab>('POST', `/classes/${id(classId)}/labs`, lab),
    getLab: (labId) => call<Lab>('GET', `/labs/${id(labId)}`),
    submit: (labId, code) =>
      call<Submission>('POST', `/labs/${id(labId)}/submissions`, { code }),
    listSubmissions: (labId) =>
      call<Submission[]>('GET', `/labs/${id(labId)}/submissions`),
    getSubmission: (submissionId) =>
      call<Submission>('GET', `/submissions/${id(submissionId)}`),
    getReviewQueue: (labId) =>
      call<ReviewQueue>('GET', `/labs/${id(labId)}/review-queue`),
    review: (verdictId, decision: ReviewDecision, note?: string) =>
      call<Verdict>('POST', `/verdicts/${id(verdictId)}/review`, { decision, note }),
    publish: (labId) => call<PublishReceipt>('POST', `/labs/${id(labId)}/publish`)
  };
}
