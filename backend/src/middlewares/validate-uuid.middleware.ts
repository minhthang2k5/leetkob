import { Request, Response, NextFunction } from 'express';
import { sendInvalidRequest } from '../utils/problem';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateLabIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { labId } = req.params;

  if (!labId || !UUID_V4_REGEX.test(labId)) {
    sendInvalidRequest(
      res,
      req.originalUrl,
      [
        {
          parameter: 'labId',
          detail: 'labId path parameter must be a canonical RFC 4122 UUID v4 string.'
        }
      ],
      'The requested labId path parameter is not a valid canonical UUID v4 string.'
    );
    return;
  }

  next();
}
