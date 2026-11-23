import { PrismaClient } from '@prisma/client';
import { createWorker, defaultDeps, SubmissionStore } from './index';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!process.env.WORKER_SAMPLE_SEED) throw new Error('WORKER_SAMPLE_SEED is required');
  if (process.env.MODEL_OFF !== '1')
    throw new Error(
      'CLI requires MODEL_OFF=1 until the checker exports its real model adapter; programmatic callers can inject SemanticJudge'
    );
  const db = new PrismaClient();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const worker = createWorker(new SubmissionStore(db), defaultDeps, {
    seed: process.env.WORKER_SAMPLE_SEED,
    labCapUsd: Number(process.env.LAB_COST_CAP_USD ?? '3'),
    checkOptions: { modelOff: true },
    onEvent: (event) => console.info(JSON.stringify(event))
  });
  try {
    await worker.run(controller.signal);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error(
      'Worker could not start or continue; check configuration and infrastructure.'
    );
    process.exitCode = 1;
  });
}
