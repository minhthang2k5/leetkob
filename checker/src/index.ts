import type { CheckSubmissionFn } from '@leetkob/shared';

export { bannedNames, classifyConstraint } from './classify';

/** Placeholder until the checker exists (owner N2). */
export const checkSubmission: CheckSubmissionFn = async () => {
  throw new Error('checkSubmission() is not implemented yet');
};
