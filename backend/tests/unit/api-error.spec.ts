import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { respond } from '../../src/utils/api-error';
import { expectProblem } from '../helpers/problem';

// An unexpected error's message can carry request data. It must not reach the log raw
// (log injection, SonarCloud S5145) nor the client.
const FORGED = 'lab 1\n[Auth] admin logged in from 10.0.0.1';

const app = express();
app.get('/boom', (req, res) =>
  respond(res, req.originalUrl, 200, async () => {
    throw new TypeError(FORGED);
  })
);

describe('respond() on an unexpected error', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs only the error class, never its message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).get('/boom');

    expect(log).toHaveBeenCalledWith('[Unhandled]', 'TypeError');
    expect(JSON.stringify(log.mock.calls)).not.toContain('admin logged in');
  });

  it('answers a generic 500 problem without the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/boom');

    expectProblem(res, 500, 'internal', 'INTERNAL_ERROR', '/boom');
    expect(JSON.stringify(res.body)).not.toContain('admin logged in');
  });
});
