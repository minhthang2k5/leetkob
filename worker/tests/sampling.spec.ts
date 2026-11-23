import { describe, expect, it } from 'vitest';
import { isSampledPass } from '../src/sampling';

describe('deterministic PASS audit sampling', () => {
  it('is stable across calls and process order', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `submission-${i}`);
    const first = ids.map((id) => isSampledPass('fixture-seed', id, 'C1'));
    const reverse = ids
      .reverse()
      .map((id) => isSampledPass('fixture-seed', id, 'C1'))
      .reverse();
    expect(first).toEqual(reverse);
  });
  it('samples approximately ten percent, rather than every tenth arrival', () => {
    const selected = Array.from({ length: 10000 }, (_, i) =>
      isSampledPass('fixture-seed', String(i), 'C1')
    );
    expect(selected.filter(Boolean).length).toBeGreaterThan(850);
    expect(selected.filter(Boolean).length).toBeLessThan(1150);
    expect(selected.slice(0, 100)).not.toEqual(selected.slice(100, 200));
  });
  it('separates seeds and constraints', () => {
    const vector = (seed: string, constraint: string) =>
      Array.from({ length: 100 }, (_, i) => isSampledPass(seed, String(i), constraint));
    expect(vector('a', 'C1')).not.toEqual(vector('b', 'C1'));
    expect(vector('a', 'C1')).not.toEqual(vector('a', 'C2'));
  });
});
