import { describe, expect, it } from 'vitest';
import { checkSubmission } from '@leetkob/checker';
import { judge } from '@leetkob/sandbox';
import { defaultDeps } from '../src';

describe('worker wiring', () => {
  it('uses the sandbox and checker packages by default', () => {
    expect(defaultDeps.judge).toBe(judge);
    expect(defaultDeps.checkSubmission).toBe(checkSubmission);
  });
});
