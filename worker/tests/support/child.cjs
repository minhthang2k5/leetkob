// Test-only bootstrap: never imported by the production CLI.
const { PrismaClient } = require('@prisma/client');
const { createWorker, SubmissionStore } = require('../../dist');
const { judge } = require('@leetkob/sandbox');

if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
) {
  throw new Error('Child fixture refuses a non-test database');
}
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } }
});
const controller = new AbortController();
process.on('message', (message) => {
  if (message === 'stop') controller.abort();
});
process.once('SIGTERM', () => controller.abort());
const worker = createWorker(
  new SubmissionStore(db),
  {
    judge,
    checkSubmission: async (input) => {
      if (process.env.WORKER_TEST_HOLD === '1') {
        process.send?.({ type: 'checker-held' });
        await new Promise(() => {});
      }
      return {
        verdicts: input.constraints.map((c) => ({
          constraintId: c.id,
          constraintCode: c.code,
          verdict: 'PASS',
          source: 'HARD_RULE',
          evidence: [],
          reason: null
        })),
        calls: []
      };
    }
  },
  { seed: 'fixture-process-seed', pollMs: 50 }
);

worker.run(controller.signal).then(
  async () => {
    await db.$disconnect();
    process.disconnect?.();
  },
  async () => {
    console.error('Worker child fixture failed');
    await db.$disconnect();
    process.exitCode = 1;
    process.disconnect?.();
  }
);
