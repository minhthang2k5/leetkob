import { describe, expect, it } from 'vitest';
import { checkSubmission, classifyConstraint } from '../src';

// Skeleton only: replace with real tests (trap cases first) when the checker is built.
describe('checker package', () => {
  it('exports the functions named in the contract (A.2)', () => {
    expect(typeof checkSubmission).toBe('function');
    expect(typeof classifyConstraint).toBe('function');
  });
});
