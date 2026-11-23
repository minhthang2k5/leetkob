import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/utils/prisma';
import { SEED_DATA } from '../../prisma/seed';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';

// Database rules that docs/contract/pa3-interfaces.md relies on (A.4 queue, judged once).
const labId = SEED_DATA.labs.ready.id;
const studentId = SEED_DATA.users.student.id;

async function makeConstraint(code = 'C1') {
  return prisma.constraint.create({
    data: { labId, code, text: 'Do not use `std::sort`.', deduction: 3, kind: 'BAN_LIST' }
  });
}

async function makeSubmission() {
  return prisma.submission.create({ data: { labId, studentId, code: 'int main() {}' } });
}

describe('PA#3 schema', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('a new submission waits in the queue: QUEUED, 0 attempts, no result', async () => {
    const s = await makeSubmission();
    expect(s).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      result: null,
      lockedAt: null,
      judgedAt: null
    });
  });

  it('judging the same submission twice leaves one verdict per constraint (upsert)', async () => {
    const [c, s] = await Promise.all([makeConstraint(), makeSubmission()]);
    const key = { submissionId_constraintId: { submissionId: s.id, constraintId: c.id } };

    for (const verdict of ['VIOLATION', 'UNSURE'] as const) {
      await prisma.constraintVerdict.upsert({
        where: key,
        create: { submissionId: s.id, constraintId: c.id, verdict, source: 'HARD_RULE' },
        update: { verdict }
      });
    }

    const rows = await prisma.constraintVerdict.findMany({
      where: { submissionId: s.id }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ verdict: 'UNSURE', evidence: [], isReviewed: false });
  });

  it('refuses a second verdict row for the same submission and constraint', async () => {
    const [c, s] = await Promise.all([makeConstraint(), makeSubmission()]);
    const data = {
      submissionId: s.id,
      constraintId: c.id,
      verdict: 'PASS' as const,
      source: 'MODEL' as const
    };
    await prisma.constraintVerdict.create({ data });

    const error = await prisma.constraintVerdict
      .create({ data })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
  });

  it('constraint codes are unique inside a lab, not across labs', async () => {
    await makeConstraint('C1');
    await expect(makeConstraint('C1')).rejects.toMatchObject({ code: 'P2002' });

    const other = await prisma.constraint.create({
      data: {
        labId: SEED_DATA.labs.classB.id,
        code: 'C1',
        text: 'Implement merge sort recursively.',
        deduction: 5,
        kind: 'SEMANTIC'
      }
    });
    expect(other.code).toBe('C1');
  });

  it('two workers claiming at the same time never get the same submission (SKIP LOCKED)', async () => {
    const [a, b] = await Promise.all([makeSubmission(), makeSubmission()]);

    // Worker 1 holds its row lock open while worker 2 claims.
    const claimed: string[] = [];
    await prisma.$transaction(async (tx1) => {
      const [first] = await tx1.$queryRaw<{ id: string }[]>`
        SELECT id FROM submissions WHERE status = 'QUEUED'
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      claimed.push(first.id);

      const [second] = await prisma.$transaction(
        (tx2) =>
          tx2.$queryRaw<{ id: string }[]>`
            SELECT id FROM submissions WHERE status = 'QUEUED'
            ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      claimed.push(second.id);
    });

    expect(new Set(claimed)).toEqual(new Set([a.id, b.id]));
  });

  it('deleting a lab removes its tests, constraints, submissions, verdicts and model calls', async () => {
    const [c, s] = await Promise.all([makeConstraint(), makeSubmission()]);
    await prisma.testCase.create({
      data: { labId, position: 0, input: '1\n1\n', expectedOutput: '1\n' }
    });
    await prisma.constraintVerdict.create({
      data: { submissionId: s.id, constraintId: c.id, verdict: 'PASS', source: 'MODEL' }
    });
    await prisma.modelCall.create({
      data: {
        submissionId: s.id,
        provider: 'fake',
        model: 'fake',
        inputTokens: 1,
        outputTokens: 1,
        ms: 1,
        costUsd: 0,
        status: 'OK',
        prompt: 'anonymised prompt'
      }
    });

    await prisma.lab.delete({ where: { id: labId } });

    const counts = await Promise.all([
      prisma.testCase.count({ where: { labId } }),
      prisma.constraint.count({ where: { labId } }),
      prisma.submission.count({ where: { labId } }),
      prisma.constraintVerdict.count({ where: { submissionId: s.id } }),
      prisma.modelCall.count({ where: { submissionId: s.id } })
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });
});
