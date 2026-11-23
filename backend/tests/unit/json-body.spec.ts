import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { jsonBody } from '../../src/middlewares/json-body.middleware';
import { expectProblem } from '../helpers/problem';

// The per-route parser behind every PA#3 body (2 MB for labs, 256 KB for submissions,
// 4 KB for login), tried here with a 1 KB limit.
const app = express();
app.post('/echo', jsonBody('1kb'), (req, res) => {
  res.json(req.body);
});

describe('jsonBody()', () => {
  it('passes a body under the limit through', async () => {
    const res = await request(app).post('/echo').send({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1 });
  });

  it('a body over the limit -> 400 invalid-request, not 413 or 500', async () => {
    const res = await request(app)
      .post('/echo')
      .send({ a: 'x'.repeat(2000) });

    expectProblem(res, 400, 'invalid-request', 'INVALID_REQUEST', '/echo');
    expect(res.body.errors[0].detail).toMatch(/exceeds 1kb/);
  });

  it('malformed JSON -> 400 invalid-request', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expectProblem(res, 400, 'invalid-request', 'INVALID_REQUEST', '/echo');
    expect(res.body.errors[0].detail).toMatch(/not valid JSON/);
  });
});
