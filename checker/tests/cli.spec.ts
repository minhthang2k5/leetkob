import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCliArgs, runCli } from '../src/cli';

const tempDirs: string[] = [];

function createTempFixture(): { dataDir: string; outPath: string } {
  const base = mkdtempSync(join(tmpdir(), 'leetkob-checker-cli-'));
  tempDirs.push(base);

  const dataDir = join(base, 'dataset');
  const probDir = join(dataDir, 'problems', 'demo-sort');
  const solDir = join(dataDir, 'solutions', 'demo-sort');
  mkdirSync(probDir, { recursive: true });
  mkdirSync(solDir, { recursive: true });

  writeFileSync(join(probDir, 'statement.md'), 'Sort the input array.', 'utf8');
  writeFileSync(
    join(probDir, 'constraints.json'),
    JSON.stringify([
      { id: 'C1', text: 'Do not use `std::sort`.', deduction: 3 },
      { id: 'C2', text: 'Implement merge sort recursively.', deduction: 3 }
    ]),
    'utf8'
  );

  writeFileSync(
    join(solDir, 's01.cpp'),
    [
      '#include <algorithm>',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  std::sort(a, a + 2);',
      '  return 0;',
      '}'
    ].join('\n'),
    'utf8'
  );

  return { dataDir, outPath: join(base, 'out', 'predictions.jsonl') };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('checker CLI', () => {
  it('parses positional dataset dir, --out, and --model-off flags', () => {
    const opts = parseCliArgs(['./eval/data', '--out', './preds.jsonl', '--model-off']);
    expect(opts.datasetDir).toBe('./eval/data');
    expect(opts.outPath).toBe('./preds.jsonl');
    expect(opts.modelOff).toBe(true);
  });

  it('writes lowercase JSONL predictions with MODEL_OFF=1', async () => {
    const { dataDir, outPath } = createTempFixture();
    await runCli({ datasetDir: dataDir, outPath, modelOff: true });

    const lines = readFileSync(outPath, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      solution: 'demo-sort/s01',
      constraint: 'C1',
      verdict: 'violation',
      evidence: [{ line: 4, text: 'std::sort(a, a + 2);' }]
    });
    expect(lines[1]).toEqual({
      solution: 'demo-sort/s01',
      constraint: 'C2',
      verdict: 'unsure',
      evidence: []
    });
  });
});
