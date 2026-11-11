import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateLabIdMiddleware } from '../middlewares/validate-uuid.middleware';
import { publishLabHandler } from '../controllers/lab.controller';

const router = Router();

router.post(
  '/labs/:labId/publish',
  authMiddleware,
  validateLabIdMiddleware,
  publishLabHandler
);

export default router;
