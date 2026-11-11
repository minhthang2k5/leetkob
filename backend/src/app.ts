import express, { Application, Request, Response } from 'express';
import v1Routes from './routes';
import { errorHandlerMiddleware } from './middlewares/error.middleware';

const app: Application = express();

// No body parser on purpose: the publish endpoint takes no body, and the contract says
// any body is ignored. A parser would turn a malformed body into a server error.
// A future endpoint that reads a body adds express.json() on its own route.

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'leetkob-backend' });
});

// Mount /v1 routes according to contract
app.use('/v1', v1Routes);

// Global unhandled error middleware (RFC 9457)
app.use(errorHandlerMiddleware);

export default app;
