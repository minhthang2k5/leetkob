import { Response } from 'express';
import { PROBLEM_TYPES, ProblemErrorDetail } from '../types/problem';
import { sendInternalError, sendProblem } from './problem';

const PROBLEM_BASE_URI = 'https://leetkob.example/problems/';

export type ProblemKind = keyof typeof PROBLEM_TYPES;

/** Thrown by a service; the controller turns it into the matching problem details. */
export class ApiError extends Error {
  constructor(
    public readonly kind: ProblemKind,
    message: string,
    public readonly options: {
      errors?: ProblemErrorDetail[];
      headers?: Record<string, string>;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendApiError(res: Response, instance: string, error: ApiError): Response {
  const meta = PROBLEM_TYPES[error.kind];
  for (const [name, value] of Object.entries(error.options.headers ?? {})) {
    res.setHeader(name, value);
  }
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail: error.message,
    instance,
    code: meta.code,
    ...(error.options.errors ? { errors: error.options.errors } : {})
  });
}

/** Runs a handler body: ApiError -> its problem, anything else -> a generic 500. */
export async function respond(
  res: Response,
  instance: string,
  status: number,
  work: () => Promise<unknown>
): Promise<void> {
  try {
    const body = await work();
    res
      .status(status)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .json(body);
  } catch (error) {
    if (error instanceof ApiError) {
      sendApiError(res, instance, error);
      return;
    }
    console.error('[Unhandled]', (error as Error).message);
    sendInternalError(res, instance);
  }
}
