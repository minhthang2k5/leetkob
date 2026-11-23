import express, { NextFunction, Request, Response } from 'express';
import { sendInvalidRequest } from '../utils/problem';

/**
 * express.json() for one route. A body that is not valid JSON, or too large, is a
 * 400 invalid-request problem instead of falling through to the 500 handler.
 */
export function jsonBody(limit: string) {
  const parse = express.json({ limit });
  return (req: Request, res: Response, next: NextFunction): void => {
    parse(req, res, (err?: unknown) => {
      if (err) {
        const tooLarge = (err as { type?: string }).type === 'entity.too.large';
        sendInvalidRequest(res, req.originalUrl, [
          {
            pointer: '',
            detail: tooLarge ? `Body exceeds ${limit}.` : 'Body is not valid JSON.'
          }
        ]);
        return;
      }
      next();
    });
  };
}
