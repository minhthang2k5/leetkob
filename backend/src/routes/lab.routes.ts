import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { jsonBody } from '../middlewares/json-body.middleware';
import {
  validateLabIdMiddleware,
  validateUuidParam
} from '../middlewares/validate-uuid.middleware';
import { publishLabHandler } from '../controllers/lab.controller';
import {
  createLabHandler,
  getLabHandler,
  getSubmissionHandler,
  listLabsHandler,
  listSubmissionsHandler,
  reviewQueueHandler,
  reviewVerdictHandler,
  submitHandler
} from '../controllers/labs.controller';

const router = Router();
const classId = validateUuidParam('classId');
const labId = validateLabIdMiddleware;
const submissionId = validateUuidParam('submissionId');
const verdictId = validateUuidParam('verdictId');

// PA#2 (docs/contract/publish.md): unchanged.
router.post('/labs/:labId/publish', authMiddleware, labId, publishLabHandler);

// PA#3 (docs/contract/pa3-interfaces.md, B.4 and B.5). Bodies are parsed per route,
// with the size limit of that route.
router.get('/classes/:classId/labs', authMiddleware, classId, listLabsHandler);
router.post(
  '/classes/:classId/labs',
  authMiddleware,
  classId,
  jsonBody('2mb'),
  createLabHandler
);
router.get('/labs/:labId', authMiddleware, labId, getLabHandler);
router.post(
  '/labs/:labId/submissions',
  authMiddleware,
  labId,
  jsonBody('256kb'),
  submitHandler
);
router.get('/labs/:labId/submissions', authMiddleware, labId, listSubmissionsHandler);
router.get(
  '/submissions/:submissionId',
  authMiddleware,
  submissionId,
  getSubmissionHandler
);

// Review queue (B.6): TA of the class or admin.
router.get('/labs/:labId/review-queue', authMiddleware, labId, reviewQueueHandler);
router.post(
  '/verdicts/:verdictId/review',
  authMiddleware,
  verdictId,
  jsonBody('16kb'),
  reviewVerdictHandler
);

export default router;
