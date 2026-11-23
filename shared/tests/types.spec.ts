import { describe, expectTypeOf, it } from 'vitest';
import type { CheckInput, CheckVerdict, JudgeJob, SemanticJudge } from '../src';

// These run under `npm run typecheck`: a type that drifts from the contract fails to compile.
describe('shared types follow docs/contract/pa3-interfaces.md', () => {
  it('a job carries only the submission id (A.4)', () => {
    expectTypeOf<keyof JudgeJob>().toEqualTypeOf<'submissionId'>();
  });

  it('the checker never sees deductions or identity (A.2)', () => {
    expectTypeOf<CheckVerdict>().not.toHaveProperty('deduction');
    expectTypeOf<keyof CheckInput>().toEqualTypeOf<
      'statement' | 'constraints' | 'code'
    >();
  });

  it('the model adapter returns untrusted output (A.3)', () => {
    type Returned = Awaited<ReturnType<SemanticJudge['judge']>>;
    expectTypeOf<Returned['raw']>().toBeUnknown();
  });
});
