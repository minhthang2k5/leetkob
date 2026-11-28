import { describe, expect, it } from 'vitest';
import type { CheckConstraint, EvidenceLine } from '@leetkob/shared';
import { checkHardRule } from '../src/hard-rules';

function makeConstraint(text: string, code = 'C1'): CheckConstraint {
  return { id: `id-${code}`, code, text };
}

interface TrapCase {
  title: string;
  rule: string;
  lines: string[];
}

interface ViolationCase {
  title: string;
  rule: string;
  lines: string[];
  expectedEvidence: EvidenceLine[];
}

const TRAP_CASES: TrapCase[] = [
  {
    title: 'allows student-defined sort function in global scope',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <iostream>',
      'void sort(int* a, int n) {',
      '  for (int i = 0; i < n; ++i) {}',
      '}',
      'int main() {',
      '  int a[3] = {3, 1, 2};',
      '  sort(a, 3);',
      '  return 0;',
      '}'
    ]
  },
  {
    title:
      'allows student-defined sort in a custom namespace even with using namespace std',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <iostream>',
      'using namespace std;',
      'namespace my {',
      '  void sort(int* a, int n) { (void)a; (void)n; }',
      '}',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  my::sort(a, 2);',
      '  return 0;',
      '}'
    ]
  },
  {
    title: 'allows member function named sort on a student struct/class',
    rule: 'Do not use `std::sort`.',
    lines: [
      'using namespace std;',
      'struct Sorter {',
      '  void sort(int* a, int n) { (void)a; (void)n; }',
      '};',
      'int main() {',
      '  Sorter s;',
      '  int a[2] = {2, 1};',
      '  s.sort(a, 2);',
      '  return 0;',
      '}'
    ]
  },
  {
    title: 'ignores banned names inside comments and string literals',
    rule: 'Do not use `std::sort` or `qsort`.',
    lines: [
      '#include <iostream>',
      '// std::sort(a, a + n);',
      '/* qsort(a, n, sizeof(int), cmp); */',
      'int main() {',
      '  std::cout << "std::sort(a, a + n)" << "\\n";',
      '  return 0;',
      '}'
    ]
  },
  {
    title: 'allows #include <algorithm> when only std::swap is called',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      'int main() {',
      '  int x = 1, y = 2;',
      '  std::swap(x, y);',
      '  return 0;',
      '}'
    ]
  },
  {
    title: 'does not match substring identifiers like merge_sort or sort_count',
    rule: 'Do not use `std::sort` or `qsort`.',
    lines: [
      'void merge_sort(int* a, int l, int r) { (void)a; (void)l; (void)r; }',
      'void my_qsort(int* a, int n) { (void)a; (void)n; }',
      'int main() {',
      '  int sort_count = 0;',
      '  int a[2] = {2, 1};',
      '  merge_sort(a, 0, 1);',
      '  my_qsort(a, 2);',
      '  return sort_count;',
      '}'
    ]
  }
];

const VIOLATION_CASES: ViolationCase[] = [
  {
    title: 'catches direct std::sort call and returns original 1-based line evidence',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      '// header comment',
      'int main() {',
      '  int a[3] = {3, 1, 2};',
      '  std::sort(a, a + 3); // inline comment',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 'std::sort(a, a + 3); // inline comment' }]
  },
  {
    title: 'catches unqualified sort() when using namespace std is declared',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      'using namespace std;',
      'int main() {',
      '  int a[3] = {3, 1, 2};',
      '  sort(a, a + 3);',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 'sort(a, a + 3);' }]
  },
  {
    title: 'catches unqualified sort() when using std::sort declaration is present',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      'using std::sort;',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  sort(a, a + 2);',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 'sort(a, a + 2);' }]
  },
  {
    title: 'catches namespace alias usage like namespace s = std; s::sort(...)',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      'namespace s = std;',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  s::sort(a, a + 2);',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 's::sort(a, a + 2);' }]
  },
  {
    title: 'catches banned C functions like qsort',
    rule: 'Do not call `qsort`.',
    lines: [
      '#include <cstdlib>',
      'int cmp(const void* a, const void* b) { return *(int*)a - *(int*)b; }',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  qsort(a, 2, sizeof(int), cmp);',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 'qsort(a, 2, sizeof(int), cmp);' }]
  },
  {
    title: 'catches banned loop keywords like for and while',
    rule: 'Do not use `for` or `while`.',
    lines: [
      'int main() {',
      '  int s = 0;',
      '  for (int i = 0; i < 3; ++i) s += i;',
      '  while (s > 0) { --s; }',
      '  return s;',
      '}'
    ],
    expectedEvidence: [
      { line: 3, text: 'for (int i = 0; i < 3; ++i) s += i;' },
      { line: 4, text: 'while (s > 0) { --s; }' }
    ]
  },
  {
    title: 'catches banned member methods like rbegin',
    rule: 'Do not call `rbegin`.',
    lines: [
      '#include <vector>',
      'int main() {',
      '  std::vector<int> v = {1, 2};',
      '  auto it = v.rbegin();',
      '  return *it;',
      '}'
    ],
    expectedEvidence: [{ line: 4, text: 'auto it = v.rbegin();' }]
  },
  {
    title: 'catches #define macro aliases to banned functions',
    rule: 'Do not use `std::sort`.',
    lines: [
      '#include <algorithm>',
      '#define sneaky std::sort',
      'int main() {',
      '  int a[2] = {2, 1};',
      '  sneaky(a, a + 2);',
      '  return 0;',
      '}'
    ],
    expectedEvidence: [{ line: 5, text: 'sneaky(a, a + 2);' }]
  }
];

describe('AST hard rules (trap cases & positive violations)', () => {
  describe('traps that MUST PASS', () => {
    it.each(TRAP_CASES)('$title', async ({ rule, lines }) => {
      const verdict = await checkHardRule(makeConstraint(rule), lines.join('\n'));
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([]);
    });
  });

  describe('violations that MUST BE CAUGHT', () => {
    it.each(VIOLATION_CASES)('$title', async ({ rule, lines, expectedEvidence }) => {
      const verdict = await checkHardRule(makeConstraint(rule), lines.join('\n'));
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual(expectedEvidence);
    });

    it('catches banned containers/types such as std::map or vector', async () => {
      const code = [
        '#include <map>',
        '#include <vector>',
        'using namespace std;',
        'int main() {',
        '  std::map<int, int> freq;',
        '  vector<int> vals;',
        '  return 0;',
        '}'
      ].join('\n');

      const mapVerdict = await checkHardRule(
        makeConstraint('Do not use `std::map`.', 'C1'),
        code
      );
      expect(mapVerdict.verdict).toBe('VIOLATION');
      expect(mapVerdict.evidence).toEqual([
        { line: 5, text: 'std::map<int, int> freq;' }
      ]);

      const vecVerdict = await checkHardRule(
        makeConstraint('Do not use `std::vector`.', 'C2'),
        code
      );
      expect(vecVerdict.verdict).toBe('VIOLATION');
      expect(vecVerdict.evidence).toEqual([{ line: 6, text: 'vector<int> vals;' }]);
    });
  });
});
