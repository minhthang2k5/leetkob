import { Router } from 'express';
import labRoutes from './lab.routes';

const router = Router();

router.use('/', labRoutes);

export default router;
