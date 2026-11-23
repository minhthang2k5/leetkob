import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { CheckResult, JudgeOutcome } from '@leetkob/shared';
import { createWorker, SubmissionStore, isSampledPass } from '../src';
import {
  accepted,
  deferred,
  expire,
  fakeChecker,
  graph,
  reset,
  submission,
  until
} from './helpers';

const db = new PrismaClient();
const other = new PrismaClient();
const store = new SubmissionStore(db);
beforeEach(() => reset(db));
afterAll(async () => {
  await db.$disconnect();
  await other.$disconnect();
});
const options = { seed: 'fixture-audit-seed' };

describe('Postgres queue and attempt ownership', () => {
  it('many contenders still allow only one RUNNING job per lab', async () => {
    const fixtures = [await graph(db), await graph(db)];
    for (const fixture of fixtures)
      for (let i = 0; i < 4; i++) await submission(db, fixture);
    const claimed = (
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          new SubmissionStore(i % 2 ? other : db).claim()
        )
      )
    ).filter(Boolean);
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((job) => job!.labId)).size).toBe(2);
    expect(await db.submission.count({ where: { status: 'RUNNING' } })).toBe(2);
  });
  it('claims the oldest job once across separate connections', async () => {
    const fixture = await graph(db);
    const first = await submission(db, fixture);
    await submission(db, fixture);
    const claims = await Promise.all([store.claim(), new SubmissionStore(other).claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.submissionId).toBe(first.id);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: first.id } })
    ).toMatchObject({ status: 'RUNNING', attempts: 1 });
  });
  it('different labs can run concurrently and tests are ordered by position', async () => {
    const a = await graph(db),
      b = await graph(db);
    await submission(db, a);
    await submission(db, b);
    const [one, two] = await Promise.all([
      store.claim(),
      new SubmissionStore(other).claim()
    ]);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(one!.submissionId).not.toBe(two!.submissionId);
    expect(one!.tests.map((t) => t.input)).toEqual(['3\n3 1 2\n', '1\n7\n']);
    expect(Object.keys(one!.input).sort()).toEqual(['code', 'constraints', 'statement']);
    expect(Object.keys(one!.input.constraints[0]).sort()).toEqual(['code', 'id', 'text']);
  });
  it('renews an owned lease but never resurrects an expired one', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const lease = (await store.claim())!;
    expect(await store.heartbeat(lease)).toBe(true);
    await expire(db, row.id);
    expect(await store.heartbeat(lease)).toBe(false);
    expect(await store.ownsLease(lease)).toBe(false);
    expect(await store.recoverExpired()).toEqual([{ submissionId: row.id, attempt: 1 }]);
    expect((await store.claim())!.attempt).toBe(2);
    expect(await store.fail(lease, 'SHOULD_NOT_LAND')).toBe(false);
    expect(await store.finish(lease, accepted, { verdicts: [], calls: [] }, 'seed')).toBe(
      false
    );
    expect(await db.constraintVerdict.count()).toBe(0);
  });
  it('expires the third abandoned attempt to FAILED instead of leaving a poison job', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    await db.submission.update({
      where: { id: row.id },
      data: { status: 'RUNNING', attempts: 3 }
    });
    await expire(db, row.id);
    await store.recoverExpired();
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastError: 'LEASE_EXPIRED',
      lockedAt: null
    });
    expect(await store.claim()).toBeNull();
  });
});

describe('worker orchestration and persistence', () => {
  it('fails closed when a real model is requested without its adapter', () => {
    expect(() =>
      createWorker(
        store,
        { judge: async () => accepted, checkSubmission: fakeChecker },
        { ...options, checkOptions: { modelOff: false } }
      )
    ).toThrow('SemanticJudge');
    expect(() =>
      createWorker(
        store,
        { judge: async () => accepted, checkSubmission: fakeChecker },
        { ...options, heartbeatMs: NaN }
      )
    ).toThrow('configuration');
  });
  it('stores the judge, complete verdicts and call log in one completion', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture, '// original comment\nint main() {}');
    const checker = vi.fn(async (input, opts): Promise<CheckResult> => {
      expect(input).toEqual({
        statement: fixture.lab.statement,
        code: row.code,
        constraints: fixture.lab.constraints.map(({ id, code, text }) => ({
          id,
          code,
          text
        }))
      });
      expect(opts).toMatchObject({ modelOff: true, labSpentUsd: 0, labCapUsd: 3 });
      const result = await fakeChecker(input, opts);
      result.calls = [
        {
          provider: 'fake',
          model: 'test-only',
          requestId: 'fake-request-1',
          inputTokens: 12,
          outputTokens: 3,
          ms: 5,
          costUsd: 0.02,
          status: 'OK',
          prompt: 'anonymised fixture request'
        }
      ];
      return result;
    });
    const worker = createWorker(
      store,
      { judge: async () => accepted, checkSubmission: checker },
      options
    );
    expect((await worker.runOnce()).kind).toBe('judged');
    expect((await worker.runOnce()).kind).toBe('idle');
    const saved = await db.submission.findUniqueOrThrow({
      where: { id: row.id },
      include: { verdicts: true, modelCalls: true }
    });
    expect(saved).toMatchObject({
      status: 'JUDGED',
      attempts: 1,
      result: 'ACCEPTED',
      durationMs: 42,
      lockedAt: null
    });
    expect(saved.judgedAt).toBeInstanceOf(Date);
    expect(saved.verdicts).toHaveLength(1);
    expect(saved.modelCalls).toHaveLength(1);
    expect(saved.verdicts[0].isSampled).toBe(
      isSampledPass(options.seed, row.id, fixture.lab.constraints[0].id)
    );
    expect(checker).toHaveBeenCalledTimes(1);
  });
  it.each([
    'WRONG_ANSWER',
    'COMPILE_ERROR',
    'TIME_LIMIT',
    'MEMORY_LIMIT',
    'RUNTIME_ERROR',
    'OUTPUT_LIMIT'
  ] as const)('finishes %s without calling checker or retrying', async (result) => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const checker = vi.fn(fakeChecker);
    const outcome: JudgeOutcome = {
      ...accepted,
      result,
      testsPassed: 0,
      compileOutput: result === 'COMPILE_ERROR' ? 'fixture syntax error' : null
    };
    await createWorker(
      store,
      { judge: async () => outcome, checkSubmission: checker },
      options
    ).runOnce();
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'JUDGED', attempts: 1, result });
    expect(checker).not.toHaveBeenCalled();
    expect(await db.constraintVerdict.count()).toBe(0);
  });
  it('retries infrastructure exactly three times and sanitizes the recorded error', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const judge = vi.fn(async () => {
      throw new Error('test-only-canary\nFORGED LOG ENTRY');
    });
    const worker = createWorker(store, { judge, checkSubmission: fakeChecker }, options);
    expect((await worker.runOnce()).kind).toBe('retry');
    expect((await worker.runOnce()).kind).toBe('retry');
    expect((await worker.runOnce()).kind).toBe('failed');
    expect((await worker.runOnce()).kind).toBe('idle');
    expect(judge).toHaveBeenCalledTimes(3);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastError: 'JUDGE_INFRASTRUCTURE_ERROR'
    });
  });
  it('keeps a lease alive while judge is still running', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const gate = deferred<JudgeOutcome>();
    const work = createWorker(
      store,
      { judge: () => gate.promise, checkSubmission: fakeChecker },
      { ...options, heartbeatMs: 30 }
    ).runOnce();
    await until(
      () => db.submission.findUniqueOrThrow({ where: { id: row.id } }),
      (s) => s.status === 'RUNNING'
    );
    await db.submission.update({
      where: { id: row.id },
      data: { lockedAt: new Date(Date.now() - 60000) }
    });
    await until(
      () => db.submission.findUniqueOrThrow({ where: { id: row.id } }),
      (s) => s.lockedAt!.getTime() > Date.now() - 1000
    );
    expect(await store.recoverExpired()).toEqual([]);
    gate.resolve(accepted);
    expect((await work).kind).toBe('judged');
  });
  it('does not let a late old judge call checker or overwrite its replacement', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const gate = deferred<JudgeOutcome>(),
      checker = vi.fn(fakeChecker);
    const old = createWorker(
      store,
      { judge: () => gate.promise, checkSubmission: checker },
      options
    ).runOnce();
    await until(
      () => db.submission.findUniqueOrThrow({ where: { id: row.id } }),
      (s) => s.status === 'RUNNING'
    );
    await expire(db, row.id);
    await store.recoverExpired();
    const fresh = createWorker(
      new SubmissionStore(other),
      { judge: async () => accepted, checkSubmission: fakeChecker },
      options
    );
    expect((await fresh.runOnce()).kind).toBe('judged');
    gate.resolve(accepted);
    expect((await old).kind).toBe('lost');
    expect(checker).not.toHaveBeenCalled();
    expect(await db.constraintVerdict.count()).toBe(1);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ attempts: 2, status: 'JUDGED' });
  });
  it('rolls back partial verdict writes and does not reset a TA review on replay', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const lease = (await store.claim())!;
    const checks = await fakeChecker(lease.input, { modelOff: true });
    const broken: CheckResult = {
      verdicts: [
        ...checks.verdicts,
        { ...checks.verdicts[0], constraintId: 'not-a-real-constraint' }
      ],
      calls: []
    };
    await expect(store.finish(lease, accepted, broken, options.seed)).rejects.toThrow();
    expect(await db.constraintVerdict.count()).toBe(0);
    await db.constraintVerdict.create({
      data: {
        submissionId: row.id,
        constraintId: fixture.lab.constraints[0].id,
        verdict: 'VIOLATION',
        source: 'MODEL',
        isReviewed: true,
        decision: 'OVERRIDDEN_PASS',
        reviewNote: 'TA checked source',
        reviewedById: fixture.ta.id
      }
    });
    expect(await store.finish(lease, accepted, checks, options.seed)).toBe(true);
    expect(await db.constraintVerdict.findFirstOrThrow()).toMatchObject({
      verdict: 'VIOLATION',
      isReviewed: true,
      decision: 'OVERRIDDEN_PASS',
      reviewNote: 'TA checked source'
    });
  });
  it('passes committed lab spend to the next checker and deduplicates recorded request ids', async () => {
    const fixture = await graph(db);
    await submission(db, fixture);
    const checker = vi.fn(async (input, opts) => {
      const result = await fakeChecker(input, opts);
      result.calls = [
        {
          provider: 'fake',
          model: 'test-only',
          requestId: 'stable-request',
          inputTokens: 1,
          outputTokens: 1,
          ms: 1,
          costUsd: 0.25,
          status: 'OK',
          prompt: 'anonymised fixture'
        }
      ];
      return result;
    });
    const worker = createWorker(
      store,
      { judge: async () => accepted, checkSubmission: checker },
      options
    );
    await worker.runOnce();
    await submission(db, fixture);
    await worker.runOnce();
    expect(checker.mock.calls[1][1].labSpentUsd).toBe(0.25);
    expect(await store.labSpend(fixture.lab.id)).toBe(0.5);
  });
  it('does not insert a second call log when the same provider response is replayed', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const lease = (await store.claim())!;
    const checks = await fakeChecker(lease.input, { modelOff: true });
    checks.calls = [
      {
        provider: 'fake',
        model: 'test-only',
        requestId: 'replayed-request',
        inputTokens: 2,
        outputTokens: 1,
        ms: 1,
        costUsd: 0.1,
        status: 'OK',
        prompt: 'anonymised fixture'
      }
    ];
    await store.finish(lease, accepted, checks, options.seed);
    await db.submission.update({
      where: { id: row.id },
      data: { status: 'RUNNING', lockedAt: new Date() }
    });
    expect(await store.finish(lease, accepted, checks, options.seed)).toBe(true);
    expect(await db.modelCall.count({ where: { submissionId: row.id } })).toBe(1);
    expect(await db.constraintVerdict.count({ where: { submissionId: row.id } })).toBe(1);
    expect(await store.labSpend(fixture.lab.id)).toBe(0.1);
  });
  it('does not overwrite an automatic verdict if a TA review commits concurrently', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const lease = (await store.claim())!;
    const verdict = await db.constraintVerdict.create({
      data: {
        submissionId: row.id,
        constraintId: fixture.lab.constraints[0].id,
        verdict: 'VIOLATION',
        source: 'MODEL'
      }
    });
    const locked = deferred<void>(),
      release = deferred<void>();
    const review = other.$transaction(
      async (tx) => {
        await tx.constraintVerdict.update({
          where: { id: verdict.id },
          data: {
            isReviewed: true,
            decision: 'OVERRIDDEN_PASS',
            reviewedById: fixture.ta.id
          }
        });
        locked.resolve();
        await release.promise;
      },
      { timeout: 10000 }
    );
    await locked.promise;
    const finish = store.finish(
      lease,
      accepted,
      await fakeChecker(lease.input, { modelOff: true }),
      options.seed
    );
    try {
      await until(
        () =>
          db.$queryRaw<
            { waiting: number }[]
          >`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%constraint_verdicts%'`,
        (rows) => rows[0].waiting > 0,
        3000
      );
    } finally {
      release.resolve();
    }
    await review;
    expect(await finish).toBe(true);
    expect(
      await db.constraintVerdict.findUniqueOrThrow({ where: { id: verdict.id } })
    ).toMatchObject({
      verdict: 'VIOLATION',
      isReviewed: true,
      decision: 'OVERRIDDEN_PASS'
    });
  });
  it('aborts a held checker on shutdown and never persists its late reply', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const entered = deferred<void>(),
      reply = deferred<CheckResult>();
    const signal = new AbortController();
    const worker = createWorker(
      store,
      {
        judge: async () => accepted,
        checkSubmission: async () => {
          entered.resolve();
          return reply.promise;
        }
      },
      { ...options, shutdownGraceMs: 10 }
    );
    const work = worker.runOnce(signal.signal);
    await entered.promise;
    signal.abort();
    expect((await work).kind).toBe('retry');
    reply.resolve({ verdicts: [], calls: [] });
    await Promise.resolve();
    expect(await db.constraintVerdict.count()).toBe(0);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'QUEUED', lastError: 'WORKER_STOPPED' });
  });
  it('rejects incomplete checker verdict sets before writing any result', async () => {
    const fixture = await graph(db),
      row = await submission(db, fixture);
    const worker = createWorker(
      store,
      {
        judge: async () => accepted,
        checkSubmission: async () => ({ verdicts: [], calls: [] })
      },
      options
    );
    expect((await worker.runOnce()).kind).toBe('retry');
    expect(await db.constraintVerdict.count()).toBe(0);
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: 'QUEUED', lastError: 'CHECKER_FAILURE' });
  });
  it('stops claiming when signalled and drains the current job within its grace period', async () => {
    const fixture = await graph(db),
      first = await submission(db, fixture);
    const second = await submission(db, fixture),
      gate = deferred<JudgeOutcome>();
    const controller = new AbortController();
    const run = createWorker(
      store,
      { judge: () => gate.promise, checkSubmission: fakeChecker },
      { ...options, pollMs: 10 }
    ).run(controller.signal);
    await until(
      () => db.submission.findUniqueOrThrow({ where: { id: first.id } }),
      (s) => s.status === 'RUNNING'
    );
    controller.abort();
    gate.resolve(accepted);
    await run;
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: first.id } })
    ).toMatchObject({ status: 'JUDGED' });
    expect(
      await db.submission.findUniqueOrThrow({ where: { id: second.id } })
    ).toMatchObject({ status: 'QUEUED', attempts: 0 });
  });
});
