import { describe, expect, it } from 'vitest';
import type { CheckInput } from '@leetkob/shared';
import { checkSubmission, DEFAULT_LAB_COST_CAP_USD, FakeJudge } from '../src';

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

describe('checkSubmission', () => {
  it('never calls SemanticJudge when all constraints are BAN_LIST', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const input: CheckInput = {
      statement: 'Sort an array.',
      constraints: [
        { id: 'c1', code: 'C1', text: 'Do not use `std::sort`.' },
        { id: 'c2', code: 'C2', text: 'Do not call `qsort`.' }
      ],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, { modelOff: false, judge });
    expect(judge.callsCount).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.verdicts.map((v) => v.verdict)).toEqual(['PASS', 'PASS']);
    expect(result.verdicts.every((v) => v.source === 'HARD_RULE')).toBe(true);
  });

  it('returns UNSURE (model off) for semantic constraints without calling judge when modelOff is true', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [
        { id: 'c1', code: 'C1', text: 'Do not use `std::sort`.' },
        { id: 'c2', code: 'C2', text: 'Implement merge sort recursively.' }
      ],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, { modelOff: true, judge });
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
      reason: 'model off'
    });
  });

  it('preserves input constraint order and passes valid FakeJudge output through', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [
        { id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' },
        { id: 'c2', code: 'C2', text: 'Do not use `std::sort`.' },
        { id: 'c3', code: 'C3', text: 'Do not use an auxiliary global array.' }
      ],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, { modelOff: false, judge });
    // Single model call for all remaining semantic constraints
    expect(judge.callsCount).toBe(1);
    expect(result.calls).toHaveLength(1);
    // Stripped comments should not be present in the prompt sent to judge
    expect(result.calls[0].prompt).not.toContain('Nguyen Van A');

    expect(result.verdicts.map((v) => v.constraintId)).toEqual(['c1', 'c2', 'c3']);
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'PASS',
      source: 'MODEL'
    });
    expect(result.verdicts[1]).toMatchObject({
      constraintId: 'c2',
      verdict: 'PASS',
      source: 'HARD_RULE'
    });
    expect(result.verdicts[2]).toMatchObject({
      constraintId: 'c3',
      verdict: 'PASS',
      source: 'MODEL'
    });
  });

  it('turns invalid-json FakeJudge output into UNSURE (schema invalid)', async () => {
    const judge = new FakeJudge({ mode: 'invalid-json' });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [{ id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' }],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, { modelOff: false, judge });
    expect(result.calls).toHaveLength(1);
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'UNSURE',
      source: 'GUARDRAIL',
      evidence: [],
      reason: 'schema invalid'
    });
  });

  it('turns slow FakeJudge output into UNSURE (timeout)', async () => {
    const judge = new FakeJudge({ mode: 'slow', delayMs: 80 });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [{ id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' }],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, {
      modelOff: false,
      judge,
      timeoutMs: 20
    });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].status).toBe('TIMEOUT');
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'UNSURE',
      source: 'GUARDRAIL',
      evidence: [],
      reason: 'timeout'
    });
  });

  it('turns wrong-evidence FakeJudge output into UNSURE when evidence line mismatches', async () => {
    const judge = new FakeJudge({ mode: 'wrong-evidence' });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [{ id: 'c1', code: 'C1', text: 'Implement merge sort recursively.' }],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, { modelOff: false, judge });
    expect(result.calls).toHaveLength(1);
    expect(result.verdicts[0]).toMatchObject({
      constraintId: 'c1',
      verdict: 'UNSURE',
      source: 'GUARDRAIL',
      evidence: []
    });
    expect(result.verdicts[0].reason).toContain('does not match');
  });

  it('blocks model call and returns UNSURE when lab cost cap is reached', async () => {
    const judge = new FakeJudge({ mode: 'valid' });
    const input: CheckInput = {
      statement: 'Implement merge sort.',
      constraints: [
        { id: 'c1', code: 'C1', text: 'Do not use `std::sort`.' },
        { id: 'c2', code: 'C2', text: 'Implement merge sort recursively.' }
      ],
      code: BASE_CODE
    };

    const result = await checkSubmission(input, {
      modelOff: false,
      judge,
      labSpentUsd: DEFAULT_LAB_COST_CAP_USD,
      labCapUsd: DEFAULT_LAB_COST_CAP_USD
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
      reason: 'lab cost cap reached'
    });
  });
});
