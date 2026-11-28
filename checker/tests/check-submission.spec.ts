import { describe, expect, it } from 'vitest';
import type { CheckConstraint, CheckInput } from '@leetkob/shared';
import { checkSubmission, DEFAULT_LAB_COST_CAP_USD, FakeJudge } from '../src';
import type { ExtendedCheckOptions, FakeJudgeMode } from '../src';

const BASE_CODE = [
  '// Student: Nguyen Van A - 23120000',
  '#include <iostream>',
  'void mergeSort(int* a, int l, int r) {',
  '  if (l >= r) return;',
  '  int m = l + (r - l) / 2;',
  '  mergeSort(a, l, m);',
  '  mergeSort(a, m + 1, r);',
  '}',
  'int main() {',
  '  int a[2] = {2, 1};',
  '  mergeSort(a, 0, 1);',
  '  return 0;',
  '}'
].join('\n');

const BAN_SORT: CheckConstraint = {
  id: 'c1',
  code: 'C1',
  text: 'Do not use `std::sort`.'
};
const SEMANTIC_MERGE: CheckConstraint = {
  id: 'c2',
  code: 'C2',
  text: 'Implement merge sort recursively.'
};

function makeInput(constraints: CheckConstraint[]): CheckInput {
  return {
    statement: 'Implement merge sort.',
    constraints,
    code: BASE_CODE
  };
}

describe('checkSubmission', () => {
  it('never calls SemanticJudge when all constraints are BAN_LIST', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const result = await checkSubmission(
      makeInput([BAN_SORT, { id: 'c2', code: 'C2', text: 'Do not call `qsort`.' }]),
      { modelOff: false, judge }
    );
    expect(judge.callsCount).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.verdicts.map((v) => v.verdict)).toEqual(['PASS', 'PASS']);
    expect(result.verdicts.every((v) => v.source === 'HARD_RULE')).toBe(true);
  });

  it.each<{
    title: string;
    extraOpts: Partial<ExtendedCheckOptions>;
    expectedReason: string;
  }>([
    {
      title: 'returns UNSURE (model off) without calling judge when modelOff is true',
      extraOpts: { modelOff: true },
      expectedReason: 'model off'
    },
    {
      title: 'blocks model call and returns UNSURE when lab cost cap is reached',
      extraOpts: {
        modelOff: false,
        labSpentUsd: DEFAULT_LAB_COST_CAP_USD,
        labCapUsd: DEFAULT_LAB_COST_CAP_USD
      },
      expectedReason: 'lab cost cap reached'
    }
  ])('$title', async ({ extraOpts, expectedReason }) => {
    const judge = new FakeJudge({ mode: 'valid' });
    const result = await checkSubmission(makeInput([BAN_SORT, SEMANTIC_MERGE]), {
      modelOff: false,
      judge,
      ...extraOpts
    });

    expect(judge.callsCount).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'PASS',
      source: 'HARD_RULE'
    });
    expect(result.verdicts[1]).toMatchObject({
      constraintId: 'c2',
      verdict: 'UNSURE',
      source: 'GUARDRAIL',
      reason: expectedReason
    });
  });

  it('preserves input constraint order and passes valid FakeJudge output through', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const result = await checkSubmission(
      makeInput([
        { id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' },
        { id: 'c2', code: 'C2', text: 'Do not use `std::sort`.' },
        { id: 'c3', code: 'C3', text: 'Do not use an auxiliary global array.' }
      ]),
      { modelOff: false, judge }
    );

    expect(judge.callsCount).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].prompt).not.toContain('Nguyen Van A');
    expect(result.verdicts.map((v) => [v.constraintId, v.verdict, v.source])).toEqual([
      ['c1', 'PASS', 'MODEL'],
      ['c2', 'PASS', 'HARD_RULE'],
      ['c3', 'PASS', 'MODEL']
    ]);
  });

  it.each<{
    title: string;
    mode: FakeJudgeMode;
    delayMs?: number;
    timeoutMs?: number;
    expectedStatus?: string;
    reasonSubstring: string;
  }>([
    {
      title: 'turns invalid-json FakeJudge output into UNSURE (schema invalid)',
      mode: 'invalid-json',
      reasonSubstring: 'schema invalid'
    },
    {
      title: 'turns slow FakeJudge output into UNSURE (timeout)',
      mode: 'slow',
      delayMs: 80,
      timeoutMs: 20,
      expectedStatus: 'TIMEOUT',
      reasonSubstring: 'timeout'
    },
    {
      title: 'turns wrong-evidence FakeJudge output into UNSURE when line mismatches',
      mode: 'wrong-evidence',
      reasonSubstring: 'does not match'
    }
  ])('$title', async ({ mode, delayMs, timeoutMs, expectedStatus, reasonSubstring }) => {
    const judge = new FakeJudge({ mode, delayMs });
    const result = await checkSubmission(
      makeInput([{ id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' }]),
      { modelOff: false, judge, timeoutMs }
    );

    expect(result.calls).toHaveLength(1);
    if (expectedStatus) {
      expect(result.calls[0].status).toBe(expectedStatus);
    }
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'UNSURE',
      source: 'GUARDRAIL',
      evidence: []
    });
    expect(result.verdicts[0].reason).toContain(reasonSubstring);
  });
});
