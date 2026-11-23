import { Request, Response, NextFunction } from 'express';
import { sendInternalError } from '../utils/problem';
import { errorKind } from '../utils/api-error';

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Never expose internal stack traces, DB columns, or query errors to clients.
  // Log only the error class: its message can carry request data (log injection, S5145).
  console.error('[Unhandled Exception]:', errorKind(err));
  sendInternalError(
    res,
    req.originalUrl,
    'An unexpected server error occurred while processing the request.'
  );
}
