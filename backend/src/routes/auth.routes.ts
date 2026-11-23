import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { jsonBody } from '../middlewares/json-body.middleware';
import { loginHandler, meHandler } from '../controllers/auth.controller';

const router = Router();

// Contract B.3. Login is the only route without a bearer token.
router.post('/auth/login', jsonBody('4kb'), loginHandler);
router.get('/me', authMiddleware, meHandler);

export default router;
