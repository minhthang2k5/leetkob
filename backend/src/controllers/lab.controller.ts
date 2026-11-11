import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { publishLab, PublishError } from '../services/lab.service';
import {
  sendForbidden,
  sendNotFound,
  sendReviewsPending,
  sendInternalError
} from '../utils/problem';

export async function publishLabHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const { labId } = req.params;
  const user = req.user!;
  const instance = req.originalUrl;

  try {
    const { receipt, isReplay } = await publishLab(labId, user);

    if (isReplay) {
      res.setHeader('Idempotent-Replayed', 'true');
    }

    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .json(receipt);
  } catch (error) {
    if (error instanceof PublishError) {
      switch (error.errorType) {
        case 'FORBIDDEN_ROLE':
        case 'FORBIDDEN_CLASS':
          sendForbidden(res, instance, error.message);
          return;
        case 'LAB_NOT_FOUND':
          sendNotFound(res, instance, error.message);
          return;
        case 'REVIEWS_PENDING':
          sendReviewsPending(res, instance, error.message);
          return;
      }
    }

    sendInternalError(
      res,
      instance,
      'An unexpected server error occurred while processing the request.'
    );
  }
}
