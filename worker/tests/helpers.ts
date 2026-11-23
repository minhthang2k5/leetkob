import { PrismaClient } from '@prisma/client';
import type { CheckSubmissionFn, JudgeOutcome } from '@leetkob/shared';
import { randomUUID } from 'node:crypto';

export const accepted: JudgeOutcome = {
  result: 'ACCEPTED',
  testsPassed: 2,
  testsTotal: 2,
  compileOutput: null,
  durationMs: 42
};
export const fakeChecker: CheckSubmissionFn = async (input) => ({
  verdicts: input.constraints.map((c) => ({
    constraintId: c.id,
    constraintCode: c.code,
    verdict: 'PASS',
    source: 'HARD_RULE',
    evidence: [],
    reason: null
  })),
  calls: []
});

export async function graph(db: PrismaClient) {
  const token = `fixture-student-${randomUUID()}`;
  const taToken = `fixture-ta-${randomUUID()}`;
  const student = await db.user.create({
    data: { name: 'Student fixture identity', role: 'STUDENT', token }
  });
  const ta = await db.user.create({
    data: { name: 'TA fixture', role: 'TA', token: taToken }
  });
  const cls = await db.class.create({
    data: { name: 'Worker test class', code: `worker-${randomUUID()}` }
  });
  await db.classStudent.create({ data: { classId: cls.id, userId: student.id } });
  await db.classTA.create({ data: { classId: cls.id, userId: ta.id } });
  const lab = await db.lab.create({
    data: {
      classId: cls.id,
      title: 'Sort the input',
      statement: 'Read n and n integers. Print them in ascending order.',
      tests: {
        create: [
          { position: 1, input: '1\n7\n', expectedOutput: '7\n' },
          { position: 0, input: '3\n3 1 2\n', expectedOutput: '1 2 3\n' }
        ]
      },
      constraints: {
        create: [
          { code: 'C1', text: 'Do not use `std::sort`.', deduction: 3, kind: 'BAN_LIST' }
        ]
      }
    },
    include: { constraints: true }
  });
  return { student, ta, cls, lab, token, taToken };
}

export async function submission(
  db: PrismaClient,
  fixture: Awaited<ReturnType<typeof graph>>,
  code = 'student code as submitted'
) {
  return db.submission.create({
    data: { labId: fixture.lab.id, studentId: fixture.student.id, code }
  });
}

export async function expire(db: PrismaClient, id: string) {
  await db.submission.update({
    where: { id },
    data: { lockedAt: new Date(Date.now() - 121000) }
  });
}

export async function reset(db: PrismaClient) {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.slice(1).endsWith('_test'))
    throw new Error('Refusing to reset a non-test database');
  await db.lab.deleteMany();
  await db.class.deleteMany();
  await db.user.deleteMany();
}

export async function until<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeout = 30000
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const result = await read();
    if (ready(result)) return result;
    if (Date.now() >= deadline) throw new Error('Timed out waiting for test condition');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
