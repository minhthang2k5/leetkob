import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { prisma } from '../utils/prisma';
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
    const user = await prisma.user.findUnique({
      where: { token },
      select: { id: true, name: true, role: true }
    });

    if (!user) {
      sendUnauthorized(res, req.originalUrl, 'Invalid or unrecognized Bearer token.');
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    sendUnauthorized(res, req.originalUrl, 'Authentication verification failed.');
  }
}

