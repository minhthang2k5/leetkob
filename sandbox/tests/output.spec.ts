import { describe, expect, it } from 'vitest';
import { outputsEqual } from '../src/output';

describe('contract A.1 output comparison', () => {
  it('preserves a long internal whitespace run at the output byte boundary', () => {
    const prefix = ' '.repeat(65530);
    expect(outputsEqual(`${prefix}x\t \n`, `${prefix}x\n`)).toBe(true);
    expect(outputsEqual(`${prefix}x\n`, 'x\n')).toBe(false);
  });
  it.each([
    ['1 2   \n\n', '1 2\n', true],
    ['1\t\n2 \n', '1\n2', true],
    ['1  2\n', '1 2\n', false],
    ['1\n2\n', '1 2\n', false],
    [' 1\n', '1\n', false],
    ['\n1\n', '1\n', false],
    ['1\n\n2', '1\n2', false],
    ['', '\n\n', true],
    ['xin chào\r\n', 'xin chào\n', true]
  ])('compares %j against %j', (actual, expected, equal) => {
    expect(outputsEqual(actual, expected)).toBe(equal);
  });
});
