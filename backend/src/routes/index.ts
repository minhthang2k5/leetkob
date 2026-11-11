import { Router, Request, Response } from 'express';
import labRoutes from './lab.routes';
import { sendRouteNotFound } from '../utils/problem';

const router = Router();

router.use('/', labRoutes);

// Contract section 2: an unknown /v1 path or method is a problem details 404 too.
router.use((req: Request, res: Response) => {
  sendRouteNotFound(res, req.originalUrl);
});

export default router;
