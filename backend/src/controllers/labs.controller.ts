import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { ProblemErrorDetail } from '../types/problem';
import { ApiError, respond } from '../utils/api-error';
import {
  validateNewLab,
  validateNewSubmission,
  validateReview
} from '../validation/lab.validation';
import { createLab, getLab, listLabs } from '../services/labs.service';
import { getSubmission, listSubmissions, submit } from '../services/submissions.service';
import { getReviewQueue, reviewVerdict } from '../services/reviews.service';

function invalid(errors: ProblemErrorDetail[]): ApiError {
  return new ApiError('INVALID_REQUEST', 'The request payload failed validation.', {
    errors
  });
}

export const listLabsHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, () => listLabs(req.user!, req.params.classId));

export const createLabHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 201, async () => {
    const parsed = validateNewLab(req.body);
    if (!parsed.ok) throw invalid(parsed.errors);
    return createLab(req.user!, req.params.classId, parsed.value);
  });

export const getLabHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, () => getLab(req.user!, req.params.labId));

export const submitHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 202, async () => {
    const parsed = validateNewSubmission(req.body);
    if (!parsed.ok) throw invalid(parsed.errors);
    return submit(req.user!, req.params.labId, parsed.value.code);
  });

export const listSubmissionsHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, () => listSubmissions(req.user!, req.params.labId));

export const getSubmissionHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, () =>
    getSubmission(req.user!, req.params.submissionId)
  );

export const reviewQueueHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, () => getReviewQueue(req.user!, req.params.labId));

export const reviewVerdictHandler = (req: AuthenticatedRequest, res: Response) =>
  respond(res, req.originalUrl, 200, async () => {
    const parsed = validateReview(req.body);
    if (!parsed.ok) throw invalid(parsed.errors);
    return reviewVerdict(req.user!, req.params.verdictId, parsed.value);
  });
