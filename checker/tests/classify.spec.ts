import { describe, expect, it } from 'vitest';
import { bannedNames, classifyConstraint } from '../src';

describe('classifyConstraint (brief section 3: ban list vs semantic)', () => {
  it.each([
    'Do not use `std::sort` or `std::stable_sort`.',
    'Do not call `qsort`.',
    '  do not use `std::map`',
    'Do not use `vector` and do not use `std::list`.'
  ])('ban list: %s', (text) => {
    expect(classifyConstraint(text)).toBe('BAN_LIST');
  });

  it.each([
    'Implement merge sort recursively.',
    // Starts like a ban list but names nothing in backticks: a hard rule cannot decide it.
    'Do not use any library sorting function.',
    // Names in backticks but not a "Do not use/call" sentence.
    'Use `std::vector` for the buffer.',
    'You must not use `std::sort`.',
    // "Do not user..." is not "Do not use".
    'Do not user-define `operator<`.'
  ])('semantic: %s', (text) => {
    expect(classifyConstraint(text)).toBe('SEMANTIC');
  });
});

describe('bannedNames', () => {
  it('returns every backtick name once, in order', () => {
    expect(
      bannedNames('Do not use `std::sort`, `std::stable_sort` or `std::sort`.')
    ).toEqual(['std::sort', 'std::stable_sort']);
  });

  it('ignores empty backticks', () => {
    expect(bannedNames('Do not use `` or ` `.')).toEqual([]);
  });
});
