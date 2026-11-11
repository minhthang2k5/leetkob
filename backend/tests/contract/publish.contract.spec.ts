import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { SEED_DATA } from '../../prisma/seed';
import { TEST_TOKENS } from '../helpers/test-tokens';
import { resetTestDatabase, disconnectTestDatabase } from '../helpers/test-db';

describe('POST /v1/labs/:labId/publish Contract Tests', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  });

  beforeEach(async () => {
    // Reset fixtures before each test for total test isolation
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  // --------------------------------------------------------------------------
  // CT-01: Happy Path — TA Publishes Completed Lab
  // --------------------------------------------------------------------------
  it('CT-01: TA of assigned class publishes lab with zero pending reviews -> 200 OK', async () => {
    const labId = SEED_DATA.labs.ready.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['idempotent-replayed']).toBeUndefined();

    expect(res.body).toEqual({
      labId,
      status: 'PUBLISHED',
      publishedAt: expect.any(String)
    });

    // Check DB state
    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('PUBLISHED');
    expect(labInDb?.publishedAt).not.toBeNull();
    expect(labInDb?.publishedAt?.toISOString()).toBe(res.body.publishedAt);
  });

  // --------------------------------------------------------------------------
  // CT-02: Admin Publishes Completed Lab
  // --------------------------------------------------------------------------
  it('CT-02: Admin publishes lab with zero pending reviews -> 200 OK', async () => {
    const labId = SEED_DATA.labs.adminReady.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.ADMIN}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
    expect(res.body.publishedAt).toBeDefined();

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('PUBLISHED');
  });

  // --------------------------------------------------------------------------
  // CT-03: Missing Authorization Header
  // --------------------------------------------------------------------------
  it('CT-03: Missing Authorization header -> 401 Unauthorized Problem Details', async () => {
    const labId = SEED_DATA.labs.ready.id;

    const res = await request(app).post(`/v1/labs/${labId}/publish`);

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'https://leetkob.example/problems/unauthorized',
      title: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
      instance: `/v1/labs/${labId}/publish`
    });
  });

  // --------------------------------------------------------------------------
  // CT-04: Malformed or Invalid Bearer Token
  // --------------------------------------------------------------------------
  it('CT-04: Malformed or invalid Bearer token -> 401 Unauthorized Problem Details', async () => {
    const labId = SEED_DATA.labs.ready.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.INVALID}`);

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.type).toBe('https://leetkob.example/problems/unauthorized');
  });

  // --------------------------------------------------------------------------
  // CT-05: Student Role Calling Publish
  // --------------------------------------------------------------------------
  it('CT-05: Authenticated student attempts to publish -> 403 Forbidden', async () => {
    const labId = SEED_DATA.labs.ready.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.STUDENT}`);

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'https://leetkob.example/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      instance: `/v1/labs/${labId}/publish`
    });

    // Verify DB untouched
    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('DRAFT');
  });

  // --------------------------------------------------------------------------
  // CT-06: Ownership Rule — TA of Class B Calling Lab of Class A
  // --------------------------------------------------------------------------
  it('CT-06: TA of Class B attempts to publish lab of Class A -> 403 Forbidden', async () => {
    const labId = SEED_DATA.labs.ready.id; // Belongs to Class A

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_B}`);

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('FORBIDDEN');

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('DRAFT');
  });

  // --------------------------------------------------------------------------
  // CT-07: Valid UUID but Lab Does Not Exist
  // --------------------------------------------------------------------------
  it('CT-07: Valid UUID v4 but lab does not exist -> 404 Lab Not Found', async () => {
    // Must be a canonical UUID v4 (contract section 1): version nibble 4, variant nibble 8.
    const nonExistentLabId = 'a0000000-0000-4000-8000-000000000000';

    const res = await request(app)
      .post(`/v1/labs/${nonExistentLabId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'https://leetkob.example/problems/not-found',
      title: 'Lab not found',
      status: 404,
      code: 'LAB_NOT_FOUND',
      instance: `/v1/labs/${nonExistentLabId}/publish`
    });
  });

  // --------------------------------------------------------------------------
  // CT-08: Required Review Pending — Violation or Unsure Verdicts
  // --------------------------------------------------------------------------
  it('CT-08: Lab has pending violation reviews -> 409 Reviews Pending', async () => {
    const labId = SEED_DATA.labs.pendingViolation.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'https://leetkob.example/problems/reviews-pending',
      title: 'Required reviews are pending',
      status: 409,
      code: 'REVIEWS_PENDING',
      instance: `/v1/labs/${labId}/publish`
    });

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('DRAFT');
    expect(labInDb?.publishedAt).toBeNull();
  });

  // --------------------------------------------------------------------------
  // CT-09: Required Review Pending — 10% Sampled Pass Verdict
  // --------------------------------------------------------------------------
  it('CT-09: Lab has pending sampled pass review -> 409 Reviews Pending', async () => {
    const labId = SEED_DATA.labs.pendingSampledPass.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('REVIEWS_PENDING');

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('DRAFT');
  });

  // --------------------------------------------------------------------------
  // CT-10: Invalid labId Format (Not a Canonical UUID)
  // --------------------------------------------------------------------------
  it('CT-10: labId parameter is not a canonical UUID v4 string -> 400 Bad Request', async () => {
    const res = await request(app)
      .post('/v1/labs/not-a-valid-uuid/publish')
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'https://leetkob.example/problems/invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      errors: expect.arrayContaining([expect.objectContaining({ parameter: 'labId' })])
    });
  });

  // --------------------------------------------------------------------------
  // CT-11: Idempotency — Re-calling Publish on Already Published Lab
  // --------------------------------------------------------------------------
  it('CT-11: Re-calling publish on already PUBLISHED lab -> 200 with Idempotent-Replayed: true', async () => {
    const labId = SEED_DATA.labs.alreadyPublished.id;
    const initialTimestamp = '2026-11-08T06:00:00.000Z';

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['idempotent-replayed']).toBe('true');
    expect(res.body).toEqual({
      labId,
      status: 'PUBLISHED',
      publishedAt: initialTimestamp
    });

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.publishedAt?.toISOString()).toBe(initialTimestamp);
  });

  // --------------------------------------------------------------------------
  // CT-12: Concurrent Publish Requests
  // --------------------------------------------------------------------------
  it('CT-12: Two concurrent publish requests on ready lab -> Consistent state & identical timestamp', async () => {
    const labId = SEED_DATA.labs.concurrent.id;

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/v1/labs/${labId}/publish`)
        .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`),
      request(app)
        .post(`/v1/labs/${labId}/publish`)
        .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`)
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.publishedAt).toBe(res2.body.publishedAt);

    const labInDb = await prisma.lab.findUnique({ where: { id: labId } });
    expect(labInDb?.status).toBe('PUBLISHED');
  });

  // --------------------------------------------------------------------------
  // CT-13: Security Precedes Idempotency on Already Published Lab
  // --------------------------------------------------------------------------
  it('CT-13: Student calling already published lab -> 403 Forbidden', async () => {
    const labId = SEED_DATA.labs.alreadyPublished.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.STUDENT}`);

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // CT-14: Extensibility — Non-empty Unexpected Body is Safely Ignored
  // --------------------------------------------------------------------------
  it('CT-14: Client sends non-empty unexpected JSON body -> 200 OK, body safely ignored', async () => {
    const labId = SEED_DATA.labs.ready.id;

    const res = await request(app)
      .post(`/v1/labs/${labId}/publish`)
      .set('Authorization', `Bearer ${TEST_TOKENS.TA_CLASS_A}`)
      .set('Content-Type', 'application/json')
      .send({ unexpectedField: 'maliciousOrExtraValue', status: 'TAMPERED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PUBLISHED');
  });
});
