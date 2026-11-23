import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src';

describe('sandbox defaults', () => {
  it('match the contract (A.1)', () => {
    expect(DEFAULT_LIMITS).toEqual({
      cpuSeconds: 2,
      wallSeconds: 5,
      memoryMb: 256,
      pids: 64,
      outputBytes: 65536
    });
  });
});
