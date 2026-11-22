import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi, MOCK_PASSWORD } from './mock';
import { ApiError, describeProblem } from './problem';
import type { Api } from './types';

// The mock is what the UI is built against until the backend exists, so it must keep the
// rules the UI relies on. These tests pin those rules; they say nothing about the checker.

let token: string | null = null;
let api: Api;

async function as(username: string) {
  token = null;
  token = (await api.login(username, MOCK_PASSWORD)).token;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  token = null;
  api = createMockApi(() => token);
});
afterEach(() => vi.useRealTimers());

async function firstLabOf(username: string) {
  await as(username);
  const me = await api.me();
  const labs = await api.listLabs(me.classes[0].id);
  return { me, lab: labs[0] };
}

describe('mock API keeps the server rules the UI relies on', () => {
  it('rejects a wrong password with UNAUTHORIZED', async () => {
    await expect(api.login('ta.a', 'wrong')).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
  });

  it('refuses a TA of another class with FORBIDDEN', async () => {
    const { lab } = await firstLabOf('ta.a');
    await as('ta.b');
    await expect(api.getReviewQueue(lab.id)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN'
    });
  });

  it('never gives a student the review queue', async () => {
    const { lab } = await firstLabOf('sv.an');
    await expect(api.getReviewQueue(lab.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('hides the tests from a student and shows only their own submissions', async () => {
    const { lab } = await firstLabOf('sv.an');
    expect((await api.getLab(lab.id)).tests).toEqual([]);
    const mine = await api.listSubmissions(lab.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].studentName).toBeUndefined();
  });

  it('moves a new submission from QUEUED to JUDGED', async () => {
    const { lab } = await firstLabOf('sv.an');
    const s = await api.submit(lab.id, 'int main() { return 0; }');
    expect(s.status).toBe('QUEUED');
    vi.advanceTimersByTime(4000);
    expect((await api.getSubmission(s.id)).status).toBe('JUDGED');
  });

  it('refuses to publish while a verdict needs review, then publishes once all are reviewed', async () => {
    const { lab } = await firstLabOf('ta.a');
    const queue = await api.getReviewQueue(lab.id);
    expect(queue.pendingCount).toBeGreaterThan(0);
    await expect(api.publish(lab.id)).rejects.toMatchObject({
      status: 409,
      code: 'REVIEWS_PENDING'
    });

    for (const v of queue.items
      .flatMap((i) => i.verdicts)
      .filter((x) => x.requiresReview)) {
      await api.review(v.id, 'CONFIRMED');
    }
    expect((await api.getReviewQueue(lab.id)).pendingCount).toBe(0);
    const receipt = await api.publish(lab.id);
    expect(receipt.status).toBe('PUBLISHED');
  });

  it('cites evidence lines that exist in the submitted code', async () => {
    const { lab } = await firstLabOf('ta.a');
    const queue = await api.getReviewQueue(lab.id);
    for (const item of queue.items) {
      const lines = item.code.split('\n');
      for (const e of item.verdicts.flatMap((v) => v.evidence)) {
        expect(lines[e.line - 1]).toBe(e.text);
      }
    }
  });
});

describe('describeProblem', () => {
  it('tells the person what to do, keyed on the code, not the title', () => {
    const err = new ApiError({
      type: 'x',
      title: 'whatever',
      status: 409,
      code: 'REVIEWS_PENDING'
    });
    expect(describeProblem(err)).toMatch(/review/i);
  });

  it('says a failed login is a wrong username or password', () => {
    const err = new ApiError({
      type: 'x',
      title: 'Unauthorized',
      status: 401,
      code: 'UNAUTHORIZED',
      instance: '/v1/auth/login'
    });
    expect(describeProblem(err)).toBe('Sai tên đăng nhập hoặc mật khẩu.');
  });
});
