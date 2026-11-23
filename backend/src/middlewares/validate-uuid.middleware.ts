import { Request, Response, NextFunction } from 'express';
import { sendInvalidRequest } from '../utils/problem';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 400 invalid-request unless the path parameter is a canonical UUID v4 (contract B.1). */
export function validateUuidParam(name: 'classId' | 'submissionId' | 'labId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[name];
    if (!value || !UUID_V4_REGEX.test(value)) {
      sendInvalidRequest(
        res,
        req.originalUrl,
        [
          {
            parameter: name,
            detail: `${name} must be a canonical RFC 4122 UUID v4 string.`
          }
        ],
        `The ${name} path parameter is not a valid canonical UUID v4 string.`
      );
      return;
    }
    next();
  };
}

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
