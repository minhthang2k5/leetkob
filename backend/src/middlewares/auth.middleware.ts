import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { findUserByToken } from '../services/auth.service';
import { sendUnauthorized } from '../utils/problem';

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendUnauthorized(res, req.originalUrl, 'Missing or malformed Authorization header.');
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    sendUnauthorized(res, req.originalUrl, 'Bearer token must not be empty.');
    return;
  }

  try {
    // A login session (contract B.3), or a PA#2 fixture token in the test database.
    const user = await findUserByToken(token);

    if (!user) {
      sendUnauthorized(
        res,
        req.originalUrl,
        'Invalid, expired or unrecognized Bearer token.'
      );
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    sendUnauthorized(res, req.originalUrl, 'Authentication verification failed.');
  }
}
