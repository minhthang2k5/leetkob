import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { SEED_DATA } from '../../prisma/seed';
import {
  SUBMISSION_LIMIT,
  SUBMISSION_WINDOW_MS
} from '../../src/services/submissions.service';
import { TEST_TOKENS } from '../helpers/test-tokens';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';
import { expectProblem, pointers } from '../helpers/problem';

// docs/contract/pa3-interfaces.md, B.5 (and A.4: the handler only queues).
const { users, classes, labs } = SEED_DATA;
const labId = labs.ready.id; // class A, DRAFT
const otherLabId = labs.adminReady.id; // class A, DRAFT
const PEER_TOKEN = 'token-student-peer';
const OUTSIDER_TOKEN = 'token-student-not-enrolled';
const UNKNOWN_ID = '9b2f1c4e-6a3d-4f8b-9c1e-2d5a7b8c9d0e';
const CODE = '#include <iostream>\nint main() { return 0; }\n';

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const submit = (token: string, body: unknown = { code: CODE }, lab = labId) =>
  request(app)
    .post(`/v1/labs/${lab}/submissions`)
    .set(as(token))
    .send(body as object);

const SUBMISSION_KEYS = [
  'compileOutput',
  'createdAt',
  'id',
  'judgedAt',
  'labId',
  'result',
  'status',
  'testsPassed',
  'testsTotal'
];

/** Rows written straight to the DB, `minutesAgo` in the past. */
async function pastSubmissions(count: number, minutesAgo: number, lab = labId) {
  const createdAt = new Date(Date.now() - minutesAgo * 60_000);
  await prisma.submission.createMany({
    data: Array.from({ length: count }, () => ({
      labId: lab,
      studentId: users.student.id,
      code: CODE,
      createdAt
    }))
  });
}

describe('Submissions contract (B.5)', () => {
  let peerId: string;

  beforeEach(async () => {
    await resetTestDatabase();
    const peer = await prisma.user.create({
      data: { name: 'Student Peer', role: 'STUDENT', token: PEER_TOKEN }
    });
    peerId = peer.id;
    await prisma.classStudent.create({
      data: { classId: classes.classA.id, userId: peer.id }
    });
    await prisma.user.create({
      data: { name: 'Student Outsider', role: 'STUDENT', token: OUTSIDER_TOKEN }
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('POST /v1/labs/{labId}/submissions', () => {
    it('SB-01: an enrolled student submits -> 202 QUEUED, nothing judged in the handler', async () => {
      const res = await submit(TEST_TOKENS.STUDENT);

      expect(res.status).toBe(202);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(Object.keys(res.body).sort()).toEqual(SUBMISSION_KEYS);
      expect(res.body).toMatchObject({
        labId,
        status: 'QUEUED',
        result: null,
        judgedAt: null,
        testsPassed: null
      });

      const row = await prisma.submission.findUniqueOrThrow({
        where: { id: res.body.id }
      });
      expect(row).toMatchObject({ status: 'QUEUED', attempts: 0, code: CODE });
      expect(await prisma.constraintVerdict.count()).toBe(0);
    });

    it('SB-02: a TA, an admin or a student not enrolled cannot submit -> 403', async () => {
      for (const token of [TEST_TOKENS.TA_CLASS_A, TEST_TOKENS.ADMIN, OUTSIDER_TOKEN]) {
        const res = await submit(token);
        expectProblem(
          res,
          403,
          'forbidden',
          'FORBIDDEN',
          `/v1/labs/${labId}/submissions`
        );
      }
      expect(await prisma.submission.count()).toBe(0);
    });

    it('SB-03: a published lab takes no submission -> 409 lab-published', async () => {
      const lab = labs.alreadyPublished.id;
      const res = await submit(TEST_TOKENS.STUDENT, { code: CODE }, lab);
      expectProblem(
        res,
        409,
        'lab-published',
        'LAB_PUBLISHED',
        `/v1/labs/${lab}/submissions`
      );
    });

    it('SB-04: blank code, code over 64 KB, or no code -> 400 /code', async () => {
      for (const body of [{ code: '  \n ' }, { code: 'x'.repeat(64 * 1024 + 1) }, {}]) {
        const res = await submit(TEST_TOKENS.STUDENT, body);
        expectProblem(
          res,
          400,
          'invalid-request',
          'INVALID_REQUEST',
          `/v1/labs/${labId}/submissions`
        );
        expect(pointers(res)).toEqual(['/code']);
      }
    });

    it('SB-05: unknown lab -> 404; labId not a UUID v4 -> 400', async () => {
      const unknown = await submit(TEST_TOKENS.STUDENT, { code: CODE }, UNKNOWN_ID);
      expectProblem(
        unknown,
        404,
        'not-found',
        'LAB_NOT_FOUND',
        `/v1/labs/${UNKNOWN_ID}/submissions`
      );

      const bad = await submit(TEST_TOKENS.STUDENT, { code: CODE }, 'nope');
      expectProblem(
        bad,
        400,
        'invalid-request',
        'INVALID_REQUEST',
        '/v1/labs/nope/submissions'
      );
    });
  });

  describe('submission limit: 5 per 10 minutes per lab', () => {
    it('SB-06: the 6th submission in 10 minutes -> 429 with Retry-After; another lab is not affected', async () => {
      for (let i = 0; i < SUBMISSION_LIMIT; i++) {
        expect((await submit(TEST_TOKENS.STUDENT)).status).toBe(202);
      }

      const res = await submit(TEST_TOKENS.STUDENT);

      expectProblem(
        res,
        429,
        'rate-limited',
        'RATE_LIMITED',
        `/v1/labs/${labId}/submissions`
      );
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(SUBMISSION_WINDOW_MS / 1000 - 30);
      expect(retryAfter).toBeLessThanOrEqual(SUBMISSION_WINDOW_MS / 1000);
      expect(await prisma.submission.count()).toBe(SUBMISSION_LIMIT);

      expect((await submit(TEST_TOKENS.STUDENT, { code: CODE }, otherLabId)).status).toBe(
        202
      );
      // The limit is per student too.
      expect((await submit(PEER_TOKEN)).status).toBe(202);
    });

    it('SB-07: the window slides: old submissions stop counting, Retry-After follows the oldest', async () => {
      await pastSubmissions(SUBMISSION_LIMIT, 11); // outside the window
      expect((await submit(TEST_TOKENS.STUDENT)).status).toBe(202);

      await prisma.submission.deleteMany();
      await pastSubmissions(SUBMISSION_LIMIT, 9); // inside, leaves in about 60 s
      const res = await submit(TEST_TOKENS.STUDENT);

      expect(res.status).toBe(429);
      const retryAfter = Number(res.headers['retry-after']);
      expect(retryAfter).toBeGreaterThanOrEqual(50);
      expect(retryAfter).toBeLessThanOrEqual(61);
    });

    it('SB-08: requests at the same moment cannot pass the limit together', async () => {
      await pastSubmissions(SUBMISSION_LIMIT - 1, 1);

      const results = await Promise.all(
        Array.from({ length: 4 }, () => submit(TEST_TOKENS.STUDENT))
      );

      expect(results.map((r) => r.status).sort()).toEqual([202, 429, 429, 429]);
      expect(await prisma.submission.count()).toBe(SUBMISSION_LIMIT);
    });
  });

  describe('GET /v1/labs/{labId}/submissions and /v1/submissions/{id}', () => {
    it('SB-09: a student sees only their own, newest first; staff see all with studentName', async () => {
      const first = await submit(TEST_TOKENS.STUDENT);
      const second = await submit(TEST_TOKENS.STUDENT);
      await submit(PEER_TOKEN);

      const mine = await request(app)
        .get(`/v1/labs/${labId}/submissions`)
        .set(as(TEST_TOKENS.STUDENT));
      expect(mine.status).toBe(200);
      expect(mine.body.map((s: { id: string }) => s.id)).toEqual([
        second.body.id,
        first.body.id
      ]);
      expect(mine.body[0]).not.toHaveProperty('studentName');

      const all = await request(app)
        .get(`/v1/labs/${labId}/submissions`)
        .set(as(TEST_TOKENS.TA_CLASS_A));
      expect(all.body).toHaveLength(3);
      expect(all.body.map((s: { studentName: string }) => s.studentName).sort()).toEqual(
        [users.student.name, users.student.name, 'Student Peer'].sort()
      );
    });

    it('SB-10: one submission: owner, TA of the class and admin may read it', async () => {
      const { body } = await submit(TEST_TOKENS.STUDENT);
      const url = `/v1/submissions/${body.id}`;

      const owner = await request(app).get(url).set(as(TEST_TOKENS.STUDENT));
      expect(owner.status).toBe(200);
      expect(Object.keys(owner.body).sort()).toEqual(SUBMISSION_KEYS);

      for (const token of [TEST_TOKENS.TA_CLASS_A, TEST_TOKENS.ADMIN]) {
        const res = await request(app).get(url).set(as(token));
        expect(res.status).toBe(200);
        expect(res.body.studentName).toBe(users.student.name);
      }
    });

    it('SB-11: another student gets 404 (same as missing); a TA of another class 403', async () => {
      const { body } = await submit(TEST_TOKENS.STUDENT);
      const url = `/v1/submissions/${body.id}`;

      const peer = await request(app).get(url).set(as(PEER_TOKEN));
      const missing = await request(app)
        .get(`/v1/submissions/${UNKNOWN_ID}`)
        .set(as(PEER_TOKEN));
      expectProblem(peer, 404, 'submission-not-found', 'SUBMISSION_NOT_FOUND', url);
      expectProblem(
        missing,
        404,
        'submission-not-found',
        'SUBMISSION_NOT_FOUND',
        `/v1/submissions/${UNKNOWN_ID}`
      );

      const otherTa = await request(app).get(url).set(as(TEST_TOKENS.TA_CLASS_B));
      expectProblem(otherTa, 403, 'forbidden', 'FORBIDDEN', url);

      const bad = await request(app).get('/v1/submissions/123').set(as(PEER_TOKEN));
      expect(bad.body.errors).toEqual([
        expect.objectContaining({ parameter: 'submissionId' })
      ]);
      expect(peerId).toBeTruthy();
    });

    it('SB-12: a stored verdict never shows in a submission before publish', async () => {
      const { body } = await submit(TEST_TOKENS.STUDENT);
      const constraint = await prisma.constraint.create({
        data: {
          labId,
          code: 'C1',
          text: 'Do not use `std::sort`.',
          deduction: 3,
          kind: 'BAN_LIST'
        }
      });
      await prisma.constraintVerdict.create({
        data: {
          submissionId: body.id,
          constraintId: constraint.id,
          verdict: 'VIOLATION',
          source: 'HARD_RULE',
          evidence: [{ line: 2, text: 'std::sort(a, a + n);' }]
        }
      });

      const one = await request(app)
        .get(`/v1/submissions/${body.id}`)
        .set(as(TEST_TOKENS.STUDENT));
      const list = await request(app)
        .get(`/v1/labs/${labId}/submissions`)
        .set(as(TEST_TOKENS.STUDENT));

      for (const text of [JSON.stringify(one.body), JSON.stringify(list.body)]) {
        expect(text).not.toMatch(/VIOLATION|deduction|evidence|std::sort/);
      }
    });
  });
});
