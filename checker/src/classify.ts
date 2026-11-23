import type { ClassifyConstraintFn } from '@leetkob/shared';

/**
 * Brief, section 3 and leetkob-eval/README.md: a constraint that starts with
 * "Do not use" or "Do not call" is a ban list, and every banned name is in backticks.
 * Hard rules decide those; everything else is semantic and may go to the model.
 */
const BAN_PREFIX = /^\s*do not (use|call)\b/i;
// `*`, not `+`: an empty pair must still consume both backticks, or the next backtick
// would pair with the wrong one ("`` or `x`" would yield " or ").
const BACKTICK_NAME = /`([^`\n]*)`/g;

/** The names inside backticks, in order, without duplicates. */
export function bannedNames(text: string): string[] {
  const names = [...text.matchAll(BACKTICK_NAME)].map((m) => m[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

export const classifyConstraint: ClassifyConstraintFn = (text) =>
  BAN_PREFIX.test(text) && bannedNames(text).length > 0 ? 'BAN_LIST' : 'SEMANTIC';
