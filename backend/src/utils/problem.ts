import { Response } from 'express';
import { PROBLEM_TYPES, ProblemDetails, ProblemErrorDetail } from '../types/problem';

const PROBLEM_BASE_URI = 'https://leetkob.example/problems/';

export function sendProblem(res: Response, problem: ProblemDetails): Response {
  return res
    .status(problem.status)
    .setHeader('Content-Type', 'application/problem+json; charset=utf-8')
    .json(problem);
}

export function sendUnauthorized(
  res: Response,
  instance: string,
  detail = 'Missing, malformed, or invalid bearer token.'
): Response {
  const meta = PROBLEM_TYPES.UNAUTHORIZED;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code
  });
}

export function sendForbidden(
  res: Response,
  instance: string,
  detail = 'Caller lacks required permissions to perform this action.'
): Response {
  const meta = PROBLEM_TYPES.FORBIDDEN;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code
  });
}

export function sendNotFound(
  res: Response,
  instance: string,
  detail = 'The requested resource was not found.'
): Response {
  const meta = PROBLEM_TYPES.NOT_FOUND;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code
  });
}

export function sendInvalidRequest(
  res: Response,
  instance: string,
  errors: ProblemErrorDetail[],
  detail = 'The request parameters or payload failed validation.'
): Response {
  const meta = PROBLEM_TYPES.INVALID_REQUEST;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code,
    errors
  });
}

export function sendReviewsPending(
  res: Response,
  instance: string,
  detail = 'The lab still has required reviews pending.'
): Response {
  const meta = PROBLEM_TYPES.REVIEWS_PENDING;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code
  });
}

export function sendInternalError(
  res: Response,
  instance: string,
  detail = 'An unexpected server error occurred while processing the request.'
): Response {
  const meta = PROBLEM_TYPES.INTERNAL;
  return sendProblem(res, {
    type: `${PROBLEM_BASE_URI}${meta.slug}`,
    title: meta.title,
    status: meta.status,
    detail,
    instance,
    code: meta.code
  });
}
