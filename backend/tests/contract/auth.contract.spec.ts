import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { FIXTURE_PASSWORD, SEED_DATA } from '../../prisma/seed';
import { SESSION_TTL_MS, hashToken, login } from '../../src/services/auth.service';
import { TEST_TOKENS } from '../helpers/test-tokens';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';
import { expectProblem } from '../helpers/problem';

// docs/contract/pa3-interfaces.md, B.2 (errors) and B.3 (auth).
const { users, classes } = SEED_DATA;

function loginAs(username: string, password = FIXTURE_PASSWORD) {
  return request(app).post('/v1/auth/login').send({ username, password });
}

describe('Auth contract (B.3)', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  describe('POST /v1/auth/login', () => {
    it('AU-01: right credentials -> 200 with a token and the public user', async () => {
      const res = await loginAs('fixture.ta.a');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
      expect(res.body.user).toEqual({
        id: users.taClassA.id,
        name: users.taClassA.name,
        username: 'fixture.ta.a',
        role: 'TA'
      });
    });

    it('AU-02: the DB keeps only a hash of the token, never the token or the password', async () => {
      const res = await loginAs('fixture.student');
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: users.student.id }
      });

      expect(session.tokenHash).toBe(hashToken(res.body.token));
      expect(session.tokenHash).not.toBe(res.body.token);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: users.student.id }
      });
      expect(user.passwordHash).not.toContain(FIXTURE_PASSWORD);
    });

    it('AU-03: wrong password and unknown username give the same 401 invalid-credentials', async () => {
      const wrong = await loginAs('fixture.ta.a', 'not-the-password');
      const unknown = await loginAs('nobody.here', 'not-the-password');

      for (const res of [wrong, unknown]) {
        expectProblem(
          res,
          401,
          'invalid-credentials',
          'INVALID_CREDENTIALS',
          '/v1/auth/login'
        );
        expect(res.body.title).toBe('Invalid credentials');
      }
      expect(wrong.body.detail).toBe(unknown.body.detail);
      expect(await prisma.session.count()).toBe(0);
    });

    it('AU-04: missing or non-string fields -> 400 invalid-request with pointers', async () => {
      const res = await request(app).post('/v1/auth/login').send({ username: 42 });

      expectProblem(res, 400, 'invalid-request', 'INVALID_REQUEST', '/v1/auth/login');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ pointer: '/username' }),
          expect.objectContaining({ pointer: '/password' })
        ])
      );
    });

    it('AU-05: fields over the length limit -> 400 invalid-request', async () => {
      const res = await loginAs('u'.repeat(101), 'p'.repeat(201));

      expectProblem(res, 400, 'invalid-request', 'INVALID_REQUEST', '/v1/auth/login');
      expect(res.body.errors.map((e: { pointer: string }) => e.pointer).sort()).toEqual([
        '/password',
        '/username'
      ]);
    });

    it('AU-06: malformed JSON or a non-object body -> 400 invalid-request, never 500', async () => {
      const malformed = await request(app)
        .post('/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": ');
      const array = await request(app).post('/v1/auth/login').send(['fixture.ta.a']);
      const empty = await request(app).post('/v1/auth/login');

      for (const res of [malformed, array, empty]) {
        expectProblem(res, 400, 'invalid-request', 'INVALID_REQUEST', '/v1/auth/login');
      }
    });

    it('AU-07: a user without a password (PA#2 fixture token only) cannot log in', async () => {
      await prisma.user.update({
        where: { id: users.admin.id },
        data: { passwordHash: null }
      });

      const res = await loginAs('fixture.admin');
      expectProblem(
        res,
        401,
        'invalid-credentials',
        'INVALID_CREDENTIALS',
        '/v1/auth/login'
      );
    });
  });

  describe('GET /v1/me', () => {
    it('ME-01: the login token works on /v1/me', async () => {
      const { body } = await loginAs('fixture.ta.a');

      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(body.user);
    });

    it('ME-02: classes depend on the role (TA: assigned, student: enrolled, admin: all)', async () => {
      const classesOf = async (token: string) => {
        const res = await request(app)
          .get('/v1/me')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        return res.body.classes.map((c: { id: string }) => c.id);
      };

      expect(await classesOf(TEST_TOKENS.TA_CLASS_A)).toEqual([classes.classA.id]);
      expect(await classesOf(TEST_TOKENS.TA_CLASS_B)).toEqual([classes.classB.id]);
      expect(await classesOf(TEST_TOKENS.STUDENT)).toEqual([classes.classA.id]);
      expect((await classesOf(TEST_TOKENS.ADMIN)).sort()).toEqual(
        [classes.classA.id, classes.classB.id].sort()
      );
    });

    it('ME-03: a class summary has id, code and name only', async () => {
      const res = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${TEST_TOKENS.STUDENT}`);

      expect(res.body.classes).toEqual([
        { id: classes.classA.id, code: classes.classA.code, name: classes.classA.name }
      ]);
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('token');
    });

    it('ME-04: no token -> 401 unauthorized problem details', async () => {
      const res = await request(app).get('/v1/me');
      expectProblem(res, 401, 'unauthorized', 'UNAUTHORIZED', '/v1/me');
    });

    it('ME-05: a token 12 hours old -> 401, the same answer as an unknown token', async () => {
      const issuedAt = new Date(Date.now() - SESSION_TTL_MS - 1000);
      const result = await login('fixture.ta.a', FIXTURE_PASSWORD, issuedAt);

      const expired = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${result!.token}`);
      const unknown = await request(app)
        .get('/v1/me')
        .set('Authorization', 'Bearer not-a-real-token');

      expectProblem(expired, 401, 'unauthorized', 'UNAUTHORIZED', '/v1/me');
      expect(expired.body.detail).toBe(unknown.body.detail);
    });

    it('ME-06: a session token also works on the PA#2 publish endpoint', async () => {
      const { body } = await loginAs('fixture.ta.a');

      const res = await request(app)
        .post(`/v1/labs/${SEED_DATA.labs.ready.id}/publish`)
        .set('Authorization', `Bearer ${body.token}`);

      expect(res.status).toBe(200);
    });
  });
});
