import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { SEED_DATA } from '../../prisma/seed';
import { TEST_TOKENS } from '../helpers/test-tokens';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';
import { expectProblem, pointers } from '../helpers/problem';

// docs/contract/pa3-interfaces.md, B.4.
const { classes, labs } = SEED_DATA;
const classA = classes.classA.id;
const OUTSIDER_TOKEN = 'token-student-not-enrolled';
const UNKNOWN_ID = '9b2f1c4e-6a3d-4f8b-9c1e-2d5a7b8c9d0e';

const newLab = () => ({
  title: 'Sorting: merge sort',
  statement: 'Read n numbers and print them sorted.',
  tests: [
    { input: '3\n3 1 2\n', expectedOutput: '1 2 3\n' },
    { input: '1\n7\n', expectedOutput: '7\n' }
  ],
  constraints: [
    { code: 'C2', text: 'Implement merge sort recursively.', deduction: 5 },
    { code: 'C1', text: 'Do not use `std::sort` or `std::stable_sort`.', deduction: 3 },
    { code: 'C10', text: 'Do not call `qsort`.', deduction: 2 }
  ]
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

function create(token: string, body: unknown = newLab(), classId = classA) {
  return request(app)
    .post(`/v1/classes/${classId}/labs`)
    .set(as(token))
    .send(body as object);
}

describe('Labs contract (B.4)', () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await prisma.user.create({
      data: { name: 'Student Outsider', role: 'STUDENT', token: OUTSIDER_TOKEN }
    });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('POST /v1/classes/{classId}/labs', () => {
    it('LB-01: TA of the class creates a DRAFT lab -> 201 with tests in order and kinds set', async () => {
      const res = await create(TEST_TOKENS.TA_CLASS_A);

      expect(res.status).toBe(201);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toMatchObject({
        classId: classA,
        title: 'Sorting: merge sort',
        status: 'DRAFT',
        publishedAt: null,
        statement: 'Read n numbers and print them sorted.',
        tests: newLab().tests
      });
      // Numeric code order; kind decided by the server, not the client.
      expect(res.body.constraints).toEqual([
        expect.objectContaining({ code: 'C1', kind: 'BAN_LIST', deduction: 3 }),
        expect.objectContaining({ code: 'C2', kind: 'SEMANTIC', deduction: 5 }),
        expect.objectContaining({ code: 'C10', kind: 'BAN_LIST', deduction: 2 })
      ]);
      expect(await prisma.testCase.count({ where: { labId: res.body.id } })).toBe(2);
    });

    it('LB-02: a kind sent by the client is ignored', async () => {
      const body = newLab();
      (body.constraints[0] as Record<string, unknown>).kind = 'BAN_LIST';

      const res = await create(TEST_TOKENS.TA_CLASS_A, body);
      const c2 = res.body.constraints.find((c: { code: string }) => c.code === 'C2');
      expect(c2.kind).toBe('SEMANTIC');
    });

    it('LB-03: an admin may create a lab in any class', async () => {
      const res = await create(TEST_TOKENS.ADMIN, newLab(), classes.classB.id);
      expect(res.status).toBe(201);
    });

    it('LB-04: a student, even enrolled, or a TA of another class -> 403', async () => {
      for (const token of [TEST_TOKENS.STUDENT, TEST_TOKENS.TA_CLASS_B]) {
        const res = await create(token);
        expectProblem(res, 403, 'forbidden', 'FORBIDDEN', `/v1/classes/${classA}/labs`);
      }
      expect(await prisma.lab.count({ where: { title: 'Sorting: merge sort' } })).toBe(0);
    });

    it('LB-05: invalid fields -> 400 with one pointer per problem', async () => {
      const body = {
        title: 't'.repeat(201),
        statement: '   ',
        tests: [{ input: 'x'.repeat(64 * 1024 + 1), expectedOutput: 1 }],
        constraints: [
          { code: 'C1', text: 'a', deduction: -1 },
          { code: 'C1', text: '', deduction: 1.5 }
        ]
      };

      const res = await create(TEST_TOKENS.TA_CLASS_A, body);

      expectProblem(
        res,
        400,
        'invalid-request',
        'INVALID_REQUEST',
        `/v1/classes/${classA}/labs`
      );
      expect(pointers(res)).toEqual(
        [
          '/constraints/0/deduction',
          '/constraints/1/code',
          '/constraints/1/deduction',
          '/constraints/1/text',
          '/statement',
          '/tests/0/expectedOutput',
          '/tests/0/input',
          '/title'
        ].sort()
      );
    });

    it('LB-06: no tests or no constraints -> 400', async () => {
      const res = await create(TEST_TOKENS.TA_CLASS_A, {
        ...newLab(),
        tests: [],
        constraints: []
      });
      expect(pointers(res)).toEqual(['/constraints', '/tests']);
    });

    // The 2 MB body limit itself is tested in tests/unit/json-body.spec.ts with a small
    // limit: the server stops reading an oversized body, so a 2 MB upload here would see
    // the connection closed before the 400 arrives.
    it('LB-07: malformed JSON or a statement over 50 000 characters -> 400, never 500', async () => {
      const malformed = await request(app)
        .post(`/v1/classes/${classA}/labs`)
        .set(as(TEST_TOKENS.TA_CLASS_A))
        .set('Content-Type', 'application/json')
        .send('{"title":');
      const long = await create(TEST_TOKENS.TA_CLASS_A, {
        ...newLab(),
        statement: 'x'.repeat(50_001)
      });

      for (const res of [malformed, long]) {
        expectProblem(
          res,
          400,
          'invalid-request',
          'INVALID_REQUEST',
          `/v1/classes/${classA}/labs`
        );
      }
      expect(pointers(long)).toEqual(['/statement']);
    });
  });

  describe('GET /v1/classes/{classId}/labs', () => {
    it('LB-08: TA, admin and enrolled student see the labs of the class, newest first', async () => {
      const created = await create(TEST_TOKENS.TA_CLASS_A);

      for (const token of [
        TEST_TOKENS.TA_CLASS_A,
        TEST_TOKENS.ADMIN,
        TEST_TOKENS.STUDENT
      ]) {
        const res = await request(app).get(`/v1/classes/${classA}/labs`).set(as(token));
        expect(res.status).toBe(200);
        expect(res.body[0].id).toBe(created.body.id);
        expect(res.body.every((l: { classId: string }) => l.classId === classA)).toBe(
          true
        );
        expect(Object.keys(res.body[0]).sort()).toEqual(
          ['classId', 'createdAt', 'id', 'publishedAt', 'status', 'title'].sort()
        );
      }
    });

    it('LB-09: a TA of another class or a student not enrolled -> 403', async () => {
      for (const token of [TEST_TOKENS.TA_CLASS_B, OUTSIDER_TOKEN]) {
        const res = await request(app).get(`/v1/classes/${classA}/labs`).set(as(token));
        expectProblem(res, 403, 'forbidden', 'FORBIDDEN', `/v1/classes/${classA}/labs`);
      }
    });

    it('LB-10: unknown class -> 404 before 403; classId not a UUID v4 -> 400', async () => {
      const unknown = await request(app)
        .get(`/v1/classes/${UNKNOWN_ID}/labs`)
        .set(as(TEST_TOKENS.TA_CLASS_B));
      expectProblem(
        unknown,
        404,
        'class-not-found',
        'CLASS_NOT_FOUND',
        `/v1/classes/${UNKNOWN_ID}/labs`
      );

      const bad = await request(app)
        .get('/v1/classes/not-a-uuid/labs')
        .set(as(TEST_TOKENS.TA_CLASS_A));
      expectProblem(
        bad,
        400,
        'invalid-request',
        'INVALID_REQUEST',
        '/v1/classes/not-a-uuid/labs'
      );
      expect(bad.body.errors).toEqual([
        expect.objectContaining({ parameter: 'classId' })
      ]);
    });

    it('LB-11: no token -> 401', async () => {
      const res = await request(app).get(`/v1/classes/${classA}/labs`);
      expectProblem(
        res,
        401,
        'unauthorized',
        'UNAUTHORIZED',
        `/v1/classes/${classA}/labs`
      );
    });
  });

  describe('GET /v1/labs/{labId}', () => {
    it('LB-12: staff see the tests and deductions', async () => {
      const { body } = await create(TEST_TOKENS.TA_CLASS_A);

      const res = await request(app)
        .get(`/v1/labs/${body.id}`)
        .set(as(TEST_TOKENS.ADMIN));

      expect(res.status).toBe(200);
      expect(res.body.tests).toEqual(newLab().tests);
      expect(res.body.constraints.every((c: object) => 'deduction' in c)).toBe(true);
    });

    it('LB-13: a student gets tests: [] and constraints without deduction', async () => {
      const { body } = await create(TEST_TOKENS.TA_CLASS_A);

      const res = await request(app)
        .get(`/v1/labs/${body.id}`)
        .set(as(TEST_TOKENS.STUDENT));

      expect(res.status).toBe(200);
      expect(res.body.tests).toEqual([]);
      expect(res.body.statement).toBe(newLab().statement);
      for (const c of res.body.constraints) {
        expect(Object.keys(c).sort()).toEqual(['code', 'id', 'kind', 'text']);
      }
      // Hidden tests never appear anywhere in the response.
      expect(JSON.stringify(res.body)).not.toContain('1 2 3');
    });

    it('LB-14: unknown lab -> 404; lab of another class -> 403', async () => {
      const unknown = await request(app)
        .get(`/v1/labs/${UNKNOWN_ID}`)
        .set(as(TEST_TOKENS.TA_CLASS_A));
      expectProblem(unknown, 404, 'not-found', 'LAB_NOT_FOUND', `/v1/labs/${UNKNOWN_ID}`);

      const other = await request(app)
        .get(`/v1/labs/${labs.classB.id}`)
        .set(as(TEST_TOKENS.TA_CLASS_A));
      expectProblem(other, 403, 'forbidden', 'FORBIDDEN', `/v1/labs/${labs.classB.id}`);
    });
  });
});
