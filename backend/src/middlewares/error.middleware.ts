import { Request, Response, NextFunction } from 'express';
import { sendInternalError } from '../utils/problem';

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Never expose internal stack traces, DB columns, or query errors to clients
  console.error('[Unhandled Exception]:', err.message);
  sendInternalError(
    res,
    req.originalUrl,
    'An unexpected server error occurred while processing the request.'
  );
}

