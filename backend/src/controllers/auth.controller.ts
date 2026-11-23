import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { ProblemErrorDetail } from '../types/problem';
import { getMe, login } from '../services/auth.service';
import {
  sendInternalError,
  sendInvalidCredentials,
  sendInvalidRequest
} from '../utils/problem';

const LIMITS = { username: 100, password: 200 } as const;

function validateLoginBody(
  body: unknown
): { username: string; password: string } | ProblemErrorDetail[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [{ pointer: '', detail: 'Body must be a JSON object.' }];
  }
  const errors: ProblemErrorDetail[] = [];
  const values: Record<string, string> = {};
  for (const field of ['username', 'password'] as const) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value.length === 0) {
      errors.push({
        pointer: `/${field}`,
        detail: `${field} is required and must be a string.`
      });
    } else if (value.length > LIMITS[field]) {
      errors.push({
        pointer: `/${field}`,
        detail: `${field} must be at most ${LIMITS[field]} characters.`
      });
    } else {
      values[field] = value;
    }
  }
  return errors.length
    ? errors
    : { username: values.username, password: values.password };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const instance = req.originalUrl;
  const parsed = validateLoginBody(req.body);
  if (Array.isArray(parsed)) {
    sendInvalidRequest(res, instance, parsed);
    return;
  }

  try {
    const result = await login(parsed.username, parsed.password);
    if (!result) {
      sendInvalidCredentials(res, instance);
      return;
    }
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .json(result);
  } catch {
    sendInternalError(res, instance);
  }
}

export async function meHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const me = await getMe(req.user!.id);
    res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8').json(me);
  } catch {
    sendInternalError(res, req.originalUrl);
  }
}
