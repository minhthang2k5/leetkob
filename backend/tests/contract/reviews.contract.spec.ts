import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { SEED_DATA } from '../../prisma/seed';
import { TEST_TOKENS } from '../helpers/test-tokens';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';
import { expectProblem, pointers } from '../helpers/problem';

// docs/contract/pa3-interfaces.md, B.6, and publish.md (now reading these verdicts).
const { users, classes } = SEED_DATA;
const UNKNOWN_ID = '9b2f1c4e-6a3d-4f8b-9c1e-2d5a7b8c9d0e';
const CODE =
  '#include <algorithm>\n// my own merge sort\nint main() { std::sort(a, a + n); }\n';
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Setup {
  labId: string;
  /** s1: C1 VIOLATION, C2 PASS, C10 UNSURE */
  s1: string;
  /** s2: C1 PASS sampled, C2 PASS, C10 PASS */
  s2: string;
  /** s3: still QUEUED, no verdicts */
  s3: string;
  v: Record<string, string>;
}

/** A lab of class A with 3 required reviews: s1/C1, s1/C10 and s2/C1. */
async function setup(): Promise<Setup> {
  const lab = await prisma.lab.create({
    data: {
      classId: classes.classA.id,
      title: 'Review queue lab',
      statement: 'Sort numbers.',
      constraints: {
        create: [
          { code: 'C10', text: 'Do not call `qsort`.', deduction: 2, kind: 'BAN_LIST' },
          {
            code: 'C2',
            text: 'Implement merge sort recursively.',
            deduction: 5,
            kind: 'SEMANTIC'
          },
          { code: 'C1', text: 'Do not use `std::sort`.', deduction: 3, kind: 'BAN_LIST' }
        ]
      }
    },
    include: { constraints: true }
  });
  const c = Object.fromEntries(lab.constraints.map((x) => [x.code, x.id]));
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 23, 8, minutes));
  const judged = {
    status: 'JUDGED' as const,
    result: 'ACCEPTED' as const,
    judgedAt: at(30)
  };

  const s1 = await prisma.submission.create({
    data: {
      labId: lab.id,
      studentId: users.student.id,
      code: CODE,
      createdAt: at(1),
      ...judged
    }
  });
  const s2 = await prisma.submission.create({
    data: {
      labId: lab.id,
      studentId: users.student.id,
      code: CODE,
      createdAt: at(2),
      ...judged
    }
  });
  const s3 = await prisma.submission.create({
    data: { labId: lab.id, studentId: users.student.id, code: CODE, createdAt: at(3) }
  });

  const v: Record<string, string> = {};
  const rows = [
    ['s1C1', s1.id, 'C1', 'VIOLATION', false],
    ['s1C2', s1.id, 'C2', 'PASS', false],
    ['s1C10', s1.id, 'C10', 'UNSURE', false],
    ['s2C1', s2.id, 'C1', 'PASS', true],
    ['s2C2', s2.id, 'C2', 'PASS', false],
    ['s2C10', s2.id, 'C10', 'PASS', false]
  ] as const;
  for (const [key, submissionId, code, verdict, isSampled] of rows) {
    const row = await prisma.constraintVerdict.create({
      data: {
        submissionId,
        constraintId: c[code],
        verdict,
        isSampled,
        source: code === 'C2' ? 'MODEL' : 'HARD_RULE',
        evidence:
          verdict === 'VIOLATION'
            ? [{ line: 3, text: 'int main() { std::sort(a, a + n); }' }]
            : [],
        reason: verdict === 'UNSURE' ? 'timeout' : null
      }
    });
    v[key] = row.id;
  }
  return { labId: lab.id, s1: s1.id, s2: s2.id, s3: s3.id, v };
}

const queue = (labId: string, token = TEST_TOKENS.TA_CLASS_A) =>
  request(app).get(`/v1/labs/${labId}/review-queue`).set(as(token));
const review = (verdictId: string, body: unknown, token = TEST_TOKENS.TA_CLASS_A) =>
  request(app)
    .post(`/v1/verdicts/${verdictId}/review`)
    .set(as(token))
    .send(body as object);

describe('Review queue contract (B.6)', () => {
  let s: Setup;

  beforeEach(async () => {
    await resetTestDatabase();
    s = await setup();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('GET /v1/labs/{labId}/review-queue', () => {
    it('RV-01: TA of the class gets every submission, newest first, with its verdicts', async () => {
      const res = await queue(s.labId);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toMatchObject({
        labId: s.labId,
        labStatus: 'DRAFT',
        pendingCount: 3
      });
      expect(
        res.body.items.map((i: { submission: { id: string } }) => i.submission.id)
      ).toEqual([s.s3, s.s2, s.s1]);

      const [queued, , first] = res.body.items;
      expect(queued.verdicts).toEqual([]);
      expect(first.code).toBe(CODE); // as submitted, comments included
      expect(first.submission.studentName).toBe(users.student.name);
      expect(
        first.verdicts.map((v: { constraintCode: string }) => v.constraintCode)
      ).toEqual(['C1', 'C2', 'C10']);
      expect(first.verdicts[0]).toEqual({
        id: s.v.s1C1,
        constraintId: expect.any(String),
        constraintCode: 'C1',
        constraintText: 'Do not use `std::sort`.',
        deduction: 3,
        verdict: 'VIOLATION',
        source: 'HARD_RULE',
        evidence: [{ line: 3, text: 'int main() { std::sort(a, a + n); }' }],
        reason: null,
        requiresReview: true,
        isSampled: false,
        isReviewed: false,
        decision: null,
        reviewNote: null
      });
    });

    it('RV-02: requiresReview is VIOLATION, UNSURE or a sampled PASS', async () => {
      const res = await queue(s.labId);
      const flags = Object.fromEntries(
        res.body.items.flatMap(
          (i: { verdicts: { id: string; requiresReview: boolean }[] }) =>
            i.verdicts.map((v) => [v.id, v.requiresReview])
        )
      );
      expect(flags).toEqual({
        [s.v.s1C1]: true,
        [s.v.s1C2]: false,
        [s.v.s1C10]: true,
        [s.v.s2C1]: true,
        [s.v.s2C2]: false,
        [s.v.s2C10]: false
      });
    });

    it('RV-03: admin may read it; a student or a TA of another class -> 403', async () => {
      expect((await queue(s.labId, TEST_TOKENS.ADMIN)).status).toBe(200);
      for (const token of [TEST_TOKENS.STUDENT, TEST_TOKENS.TA_CLASS_B]) {
        const res = await queue(s.labId, token);
        expectProblem(
          res,
          403,
          'forbidden',
          'FORBIDDEN',
          `/v1/labs/${s.labId}/review-queue`
        );
      }
    });

    it('RV-04: unknown lab -> 404, bad id -> 400, no token -> 401', async () => {
      expectProblem(
        await queue(UNKNOWN_ID, TEST_TOKENS.TA_CLASS_B),
        404,
        'not-found',
        'LAB_NOT_FOUND',
        `/v1/labs/${UNKNOWN_ID}/review-queue`
      );
      expectProblem(
        await queue('x'),
        400,
        'invalid-request',
        'INVALID_REQUEST',
        '/v1/labs/x/review-queue'
      );
      const anon = await request(app).get(`/v1/labs/${s.labId}/review-queue`);
      expectProblem(
        anon,
        401,
        'unauthorized',
        'UNAUTHORIZED',
        `/v1/labs/${s.labId}/review-queue`
      );
    });
  });

  describe('POST /v1/verdicts/{verdictId}/review', () => {
    it('RV-05: a review records the decision, who and when; the automatic verdict is kept', async () => {
      const res = await review(s.v.s1C1, {
        decision: 'CONFIRMED',
        note: 'clear std::sort'
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: s.v.s1C1,
        verdict: 'VIOLATION',
        isReviewed: true,
        decision: 'CONFIRMED',
        reviewNote: 'clear std::sort'
      });
      const row = await prisma.constraintVerdict.findUniqueOrThrow({
        where: { id: s.v.s1C1 }
      });
      expect(row.reviewedById).toBe(users.taClassA.id);
      expect(row.reviewedAt).toBeInstanceOf(Date);
      expect((await queue(s.labId)).body.pendingCount).toBe(2);
    });

    it('RV-06: an override keeps the model verdict next to the human one; it may change before publish', async () => {
      await review(s.v.s1C10, { decision: 'OVERRIDDEN_VIOLATION' });
      const res = await review(s.v.s1C10, {
        decision: 'OVERRIDDEN_PASS',
        note: 'recursion is fine'
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        verdict: 'UNSURE',
        decision: 'OVERRIDDEN_PASS',
        reviewNote: 'recursion is fine'
      });
    });

    it('RV-07: publish waits for every required review, then reviews are final', async () => {
      const publish = () =>
        request(app).post(`/v1/labs/${s.labId}/publish`).set(as(TEST_TOKENS.TA_CLASS_A));

      expectProblem(
        await publish(),
        409,
        'reviews-pending',
        'REVIEWS_PENDING',
        `/v1/labs/${s.labId}/publish`
      );

      for (const id of [s.v.s1C1, s.v.s1C10, s.v.s2C1]) {
        expect((await review(id, { decision: 'CONFIRMED' })).status).toBe(200);
      }
      expect((await queue(s.labId)).body.pendingCount).toBe(0);
      expect((await publish()).status).toBe(200);

      const late = await review(s.v.s1C1, { decision: 'OVERRIDDEN_PASS' });
      expectProblem(
        late,
        409,
        'lab-published',
        'LAB_PUBLISHED',
        `/v1/verdicts/${s.v.s1C1}/review`
      );
      const row = await prisma.constraintVerdict.findUniqueOrThrow({
        where: { id: s.v.s1C1 }
      });
      expect(row.decision).toBe('CONFIRMED');
    });

    it('RV-08: reviewing a PASS that was not sampled is allowed and changes no count', async () => {
      const res = await review(s.v.s2C2, { decision: 'CONFIRMED' });
      expect(res.status).toBe(200);
      expect(res.body.requiresReview).toBe(false);
      expect((await queue(s.labId)).body.pendingCount).toBe(3);
    });

    it('RV-09: bad decision or note -> 400 with pointers; malformed JSON -> 400', async () => {
      const url = `/v1/verdicts/${s.v.s1C1}/review`;
      const bad = await review(s.v.s1C1, { decision: 'MAYBE', note: 'n'.repeat(1001) });
      expectProblem(bad, 400, 'invalid-request', 'INVALID_REQUEST', url);
      expect(pointers(bad)).toEqual(['/decision', '/note']);

      const missing = await review(s.v.s1C1, { note: 42 });
      expect(pointers(missing)).toEqual(['/decision', '/note']);

      const malformed = await request(app)
        .post(url)
        .set(as(TEST_TOKENS.TA_CLASS_A))
        .set('Content-Type', 'application/json')
        .send('{"decision":');
      expectProblem(malformed, 400, 'invalid-request', 'INVALID_REQUEST', url);

      const row = await prisma.constraintVerdict.findUniqueOrThrow({
        where: { id: s.v.s1C1 }
      });
      expect(row.isReviewed).toBe(false);
    });

    it('RV-10: unknown verdict -> 404; a student or a TA of another class -> 403', async () => {
      expectProblem(
        await review(UNKNOWN_ID, { decision: 'CONFIRMED' }),
        404,
        'verdict-not-found',
        'VERDICT_NOT_FOUND',
        `/v1/verdicts/${UNKNOWN_ID}/review`
      );
      for (const token of [TEST_TOKENS.STUDENT, TEST_TOKENS.TA_CLASS_B]) {
        const res = await review(s.v.s1C1, { decision: 'OVERRIDDEN_PASS' }, token);
        expectProblem(
          res,
          403,
          'forbidden',
          'FORBIDDEN',
          `/v1/verdicts/${s.v.s1C1}/review`
        );
      }
      const bad = await review('nope', { decision: 'CONFIRMED' });
      expect(bad.body.errors).toEqual([
        expect.objectContaining({ parameter: 'verdictId' })
      ]);

      const row = await prisma.constraintVerdict.findUniqueOrThrow({
        where: { id: s.v.s1C1 }
      });
      expect(row.isReviewed).toBe(false);
    });
  });
});
