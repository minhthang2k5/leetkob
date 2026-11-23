import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import {
  judge,
  cleanupSandboxAttempt,
  listSandboxAttempts,
  withSandboxAttempt
} from '@leetkob/sandbox';
import { createWorker, SubmissionStore } from '../src';
import { expire, fakeChecker, graph, reset, submission, until } from './helpers';
import { prepareSandbox } from '../../sandbox/tests/prepare';

const db = new PrismaClient();
const store = new SubmissionStore(db);
const children = new Set<ChildProcess>();
let server: Server, base: string;
let source: string;

beforeAll(async () => {
  await prepareSandbox();
  const tsc = require.resolve('typescript/bin/tsc');
  for (const directory of ['shared', 'sandbox', 'checker', 'worker']) {
    await promisify(execFile)(
      process.execPath,
      [tsc, '-p', resolve(__dirname, `../../${directory}/tsconfig.build.json`)],
      { windowsHide: true, timeout: 60000 }
    );
  }
  source = await readFile(
    resolve(__dirname, '../../sandbox/tests/fixtures/sorting/accepted-sort.cpp'),
    'utf8'
  );
  const app = (await import('../../backend/src/app')).default;
  server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 300000);

beforeEach(() => reset(db));
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
  }
  children.clear();
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
  const { prisma } = await import('../../backend/src/utils/prisma');
  await prisma.$disconnect();
});

function startChild(hold = false) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'SystemRoot',
    'USERPROFILE',
    'HOME',
    'TEMP',
    'TMP',
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_CONFIG'
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    WORKER_TEST_HOLD: hold ? '1' : '0'
  });
  const child = spawn(process.execPath, [resolve(__dirname, 'support/child.cjs')], {
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  child.stdout!.resume();
  child.stderr!.resume();
  children.add(child);
  return child;
}

async function stopChild(child: ChildProcess) {
  const exited = once(child, 'exit');
  child.send('stop');
  await Promise.race([
    exited,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Child failed to stop')), 15000);
      timer.unref();
    })
  ]);
  expect(child.exitCode).toBe(0);
  children.delete(child);
}

async function request(method: string, path: string, token: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

describe('worker with real processes, Docker and API', () => {
  it('worker stopped → API queues → new worker process completes one verdict set', async () => {
    const fixture = await graph(db);
    const queued = await request(
      'POST',
      `/v1/labs/${fixture.lab.id}/submissions`,
      fixture.token,
      { code: source }
    );
    expect(queued.status).toBe(202);
    expect(queued.body.status).toBe('QUEUED');
    const id = queued.body.id as string;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await db.submission.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'QUEUED',
      attempts: 0
    });
    const child = startChild();
    await until(
      () => db.submission.findUniqueOrThrow({ where: { id } }),
      (s) => s.status === 'JUDGED',
      45000
    );
    await stopChild(child);
    expect(await db.constraintVerdict.count({ where: { submissionId: id } })).toBe(1);
    expect(await db.submission.findUniqueOrThrow({ where: { id } })).toMatchObject({
      result: 'ACCEPTED',
      attempts: 1
    });
    expect(
      (
        await createWorker(
          store,
          { judge, checkSubmission: fakeChecker },
          { seed: 'fixture' }
        ).runOnce()
      ).kind
    ).toBe('idle');
    expect(await db.constraintVerdict.count({ where: { submissionId: id } })).toBe(1);
  });

  it('a SIGKILLed worker is recovered and its old attempt cannot duplicate verdicts', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture, source);
    const child = startChild(true);
    await Promise.race([
      once(child, 'message'),
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Child never reached checker')),
          45000
        );
        timer.unref();
      })
    ]);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    children.delete(child);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'RUNNING', attempts: 1 });
    // Advance persisted lease time instead of waiting two real minutes; recovery SQL is unchanged.
    await expire(db, row.id);
    const worker = createWorker(
      store,
      { judge, checkSubmission: fakeChecker },
      { seed: 'fixture' }
    );
    expect((await worker.runOnce()).kind).toBe('judged');
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'JUDGED', attempts: 2 });
    expect(await db.constraintVerdict.count({ where: { submissionId: row.id } })).toBe(1);
  });

  it('real judge → fake constraint verdict → TA review → publish uses the current API', async () => {
    const fixture = await graph(db);
    const queued = await request(
      'POST',
      `/v1/labs/${fixture.lab.id}/submissions`,
      fixture.token,
      { code: source }
    );
    const id = queued.body.id as string;
    const checker = vi.fn(async (input, opts) => {
      const checks = await fakeChecker(input, opts);
      const line = input.code
        .split('\n')
        .findIndex((s: string) => s.includes('sort(a.begin()'));
      checks.verdicts[0] = {
        ...checks.verdicts[0],
        verdict: 'VIOLATION',
        evidence: [{ line: line + 1, text: input.code.split('\n')[line] }]
      };
      return checks;
    });
    await createWorker(
      store,
      { judge, checkSubmission: checker },
      { seed: 'fixture' }
    ).runOnce();
    const student = await request('GET', `/v1/submissions/${id}`, fixture.token);
    expect(student.body.result).toBe('ACCEPTED');
    expect(student.body).not.toHaveProperty('verdicts');
    expect(student.body).not.toHaveProperty('deduction');
    const queue = await request(
      'GET',
      `/v1/labs/${fixture.lab.id}/review-queue`,
      fixture.taToken
    );
    expect(queue.body.pendingCount).toBe(1);
    expect(
      (await request('POST', `/v1/labs/${fixture.lab.id}/publish`, fixture.taToken))
        .status
    ).toBe(409);
    const verdict = await db.constraintVerdict.findFirstOrThrow({
      where: { submissionId: id }
    });
    expect(
      (
        await request('POST', `/v1/verdicts/${verdict.id}/review`, fixture.taToken, {
          decision: 'CONFIRMED'
        })
      ).status
    ).toBe(200);
    expect(
      (await request('POST', `/v1/labs/${fixture.lab.id}/publish`, fixture.taToken))
        .status
    ).toBe(200);
  });

  it('reclaims only orphan attempt containers and preserves a live attempt', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const lease = (await store.claim())!;
    const context = { submissionId: row.id, attempt: 99 };
    const abort = new AbortController();
    const liveAbort = new AbortController();
    // Long-lived real sandbox, orphaned from the DB's point of view; no external network.
    const slow = '#include <unistd.h>\nint main(){sleep(30);}';
    const work = withSandboxAttempt(context, abort.signal, () =>
      judge(slow, [{ input: '', expectedOutput: '' }], { wallSeconds: 40 })
    );
    const captured = work.catch(() => undefined);
    const liveWork = withSandboxAttempt(lease, liveAbort.signal, () =>
      judge(slow, [{ input: '', expectedOutput: '' }], { wallSeconds: 40 })
    ).catch(() => undefined);
    await until(
      listSandboxAttempts,
      (items) =>
        items.some((s) => s.attempt === 99) && items.some((s) => s.attempt === 1),
      15000
    );
    const cleanup = vi.fn(cleanupSandboxAttempt);
    await createWorker(
      store,
      {
        judge,
        checkSubmission: fakeChecker,
        cleanupAttempt: cleanup,
        listAttempts: listSandboxAttempts
      },
      { seed: 'fixture' }
    ).reconcile();
    expect(cleanup).toHaveBeenCalledWith(context);
    expect(cleanup).not.toHaveBeenCalledWith(lease);
    expect(
      (await listSandboxAttempts()).some(
        (s) => s.submissionId === lease.submissionId && s.attempt === lease.attempt
      )
    ).toBe(true);
    abort.abort();
    liveAbort.abort();
    await Promise.all([captured, liveWork]);
    expect(
      (await listSandboxAttempts()).filter((s) => s.submissionId === row.id)
    ).toEqual([]);
  });

  it('shutdown cancels an active real sandbox after grace and returns the job to the queue', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture, '#include <unistd.h>\nint main(){sleep(30);}');
    const signal = new AbortController();
    const worker = createWorker(
      store,
      { judge, checkSubmission: fakeChecker },
      { seed: 'fixture', shutdownGraceMs: 20 }
    );
    const work = worker.runOnce(signal.signal);
    await until(
      listSandboxAttempts,
      (items) => items.some((s) => s.submissionId === row.id),
      15000
    );
    signal.abort();
    expect((await work).kind).toBe('retry');
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'QUEUED', lastError: 'WORKER_STOPPED' });
    expect(
      (await listSandboxAttempts()).filter((s) => s.submissionId === row.id)
    ).toEqual([]);
  });
});
