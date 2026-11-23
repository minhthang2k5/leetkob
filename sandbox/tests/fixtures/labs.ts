import type { JudgeResult, TestCase } from '@leetkob/shared';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface LabFixture {
  id: string;
  statement: string;
  tests: TestCase[];
}

function arrayCase(a: number[], reference: (a: number[]) => string): TestCase {
  return { input: `${a.length}\n${a.join(' ')}\n`, expectedOutput: reference([...a]) };
}

const statistics = (a: number[]) => `${a.reduce((s, x) => s + x, 0)} ${Math.max(...a)}\n`;
const dynamic = (a: number[]) => `${a.reduce((s, x) => s + x, 0)} ${Math.min(...a)}\n`;
const sorting = (a: number[]) => `${a.sort((x, y) => x - y).join(' ')}\n`;
const searchCase = (a: number[], queries: number[]): TestCase => ({
  input: `${a.length} ${queries.length}\n${a.join(' ')}\n${queries.join(' ')}\n`,
  // Linear indexOf is deliberately independent of the C++ binary searches.
  expectedOutput: `${queries.map((q) => a.indexOf(q)).join('\n')}\n`
});

export const labs: LabFixture[] = [
  {
    id: 'statistics',
    statement:
      'Read n (1..1000) and n integers (-1e9..1e9). Print their sum and maximum.',
    tests: [
      [3, 1, 2],
      [-9, -2, -7],
      [0],
      [1e9, 1e9, -1e9],
      Array.from({ length: 1000 }, (_, i) => i - 500)
    ].map((a) => arrayCase(a, statistics))
  },
  {
    id: 'sorting',
    statement:
      'Read n (1..1000) integers (-1000..1000). Print every value sorted ascending, preserving duplicates.',
    tests: [
      [3, 1, 2],
      [2, 1, 2, 1],
      [0],
      [-3, -1, -2],
      Array.from({ length: 500 }, (_, i) => 499 - i)
    ].map((a) => arrayCase(a, sorting))
  },
  {
    id: 'binary-search',
    statement:
      'Read n, q (1..1000), a nondecreasing array and q queries. Print the first zero-based index, or -1, per line.',
    tests: [
      searchCase([1, 3, 5], [1, 3, 5, 6]),
      searchCase([2, 2, 2, 8], [2, 8, 1]),
      searchCase([0], [0, 1]),
      searchCase([-5, -2, 0, 9], [-9, -5, 9]),
      searchCase(
        Array.from({ length: 500 }, (_, i) => i * 2),
        [0, 300, 998, 999]
      )
    ]
  },
  {
    id: 'reverse-line',
    statement:
      'Read one ASCII line of 0..1000 characters, including spaces. Print its reversal, followed by a newline.',
    tests: ['abcd', 'a b c', '', 'x', 'algorithm '.repeat(60)].map((s) => ({
      input: `${s}\n`,
      expectedOutput: `${[...s].reverse().join('')}\n`
    }))
  },
  {
    id: 'dynamic-array',
    statement:
      'Read n (1..10000) integers (-1000..1000). Store the sequence, then print its sum and minimum.',
    tests: [
      [5, 2, 9],
      [-3, 4, -8, 0, 2],
      [7],
      [0, 0, 0],
      Array.from({ length: 1000 }, (_, i) => ((i * 37) % 101) - 50)
    ].map((a) => arrayCase(a, dynamic))
  },
  {
    id: 'gcd',
    statement:
      'Read a, b (0..1e9). Print their greatest common divisor; gcd(0,0) is defined as 0.',
    // Hand-checked small cases; no reuse of the submitted Euclid implementations.
    tests: [
      [48, 18, 6],
      [8, 0, 8],
      [0, 9, 9],
      [0, 0, 0],
      [35, 64, 1],
      [1000000000, 250000000, 250000000]
    ].map(([a, b, gcd]) => ({ input: `${a} ${b}\n`, expectedOutput: `${gcd}\n` }))
  }
];

export const studentCases = labs.flatMap((lab) =>
  readdirSync(join(__dirname, lab.id))
    .filter((name) => /^(accepted|wrong|compile|runtime)-.*\.cpp$/.test(name))
    .map((name) => ({
      lab,
      name,
      path: join(__dirname, lab.id, name),
      result: (
        {
          accepted: 'ACCEPTED',
          wrong: 'WRONG_ANSWER',
          compile: 'COMPILE_ERROR',
          runtime: 'RUNTIME_ERROR'
        } as Record<string, JudgeResult>
      )[name.split('-')[0]]
    }))
);

export const resourceCases = [
  {
    path: join(__dirname, 'sorting/time-swapped-flag.cpp'),
    test: arrayCase([3, 1, 2], sorting),
    result: 'TIME_LIMIT'
  },
  {
    path: join(__dirname, 'sorting/output-debug.cpp'),
    test: arrayCase(
      Array.from({ length: 100 }, (_, i) => 99 - i),
      sorting
    ),
    result: 'OUTPUT_LIMIT'
  },
  {
    path: join(__dirname, 'dynamic-array/memory-square-capacity.cpp'),
    test: arrayCase(
      Array.from({ length: 10000 }, () => 1),
      dynamic
    ),
    result: 'MEMORY_LIMIT'
  }
] as const;
