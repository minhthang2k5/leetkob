import { expect } from 'vitest';
import type { Response } from 'supertest';

/**
 * AGENTS.md: every error check looks at status, Content-Type and the body
 * (type, title, code, instance), not only the status.
 */
export function expectProblem(
  res: Response,
  status: number,
  slug: string,
  code: string,
  instance: string
): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  expect(res.body).toMatchObject({
    type: `https://leetkob.example/problems/${slug}`,
    status,
    code,
    instance
  });
  expect(typeof res.body.title).toBe('string');
  expect(typeof res.body.detail).toBe('string');
}

/** The JSON pointers listed in a 400 invalid-request, sorted. */
export function pointers(res: Response): string[] {
  return (res.body.errors ?? []).map((e: { pointer?: string }) => e.pointer).sort();
}
