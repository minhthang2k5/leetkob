import { describe, expect, it } from 'vitest';
import type { CheckConstraint, EvidenceLine } from '@leetkob/shared';
import { checkHardRule } from '../src/hard-rules';

function makeConstraint(text: string, code = 'C1'): CheckConstraint {
  return { id: `id-${code}`, code, text };
}

function cpp(header: string, body: string): string {
  return header
    ? `${header}\nint main() {\n${body}\n  return 0;\n}`
    : `int main() {\n${body}\n  return 0;\n}`;
}

describe('AST hard rules (trap cases & positive violations)', () => {
  describe('traps that MUST PASS', () => {
    const trapRows: Array<[string, string, string]> = [
      [
        'allows student-defined sort function in global scope',
        'Do not use `std::sort`.',
        cpp(
          '#include <iostream>\nvoid sort(int* a, int n) {\n  for (int i = 0; i < n; ++i) {}\n}',
          '  int a[3] = {3, 1, 2};\n  sort(a, 3);'
        )
      ],
      [
        'allows student-defined sort in a custom namespace even with using namespace std',
        'Do not use `std::sort`.',
        cpp(
          '#include <iostream>\nusing namespace std;\nnamespace my {\n  void sort(int* a, int n) { (void)a; (void)n; }\n}',
          '  int a[2] = {2, 1};\n  my::sort(a, 2);'
        )
      ],
      [
        'allows member function named sort on a student struct/class',
        'Do not use `std::sort`.',
        cpp(
          'using namespace std;\nstruct Sorter {\n  void sort(int* a, int n) { (void)a; (void)n; }\n};',
          '  Sorter s;\n  int a[2] = {2, 1};\n  s.sort(a, 2);'
        )
      ],
      [
        'ignores banned names inside comments and string literals',
        'Do not use `std::sort` or `qsort`.',
        cpp(
          '#include <iostream>\n// std::sort(a, a + n);\n/* qsort(a, n, sizeof(int), cmp); */',
          '  std::cout << "std::sort(a, a + n)" << "\\n";'
        )
      ],
      [
        'allows #include <algorithm> when only std::swap is called',
        'Do not use `std::sort`.',
        cpp('#include <algorithm>', '  int x = 1, y = 2;\n  std::swap(x, y);')
      ],
      [
        'does not match substring identifiers like merge_sort or sort_count',
        'Do not use `std::sort` or `qsort`.',
        'void merge_sort(int* a, int l, int r) { (void)a; (void)l; (void)r; }\nvoid my_qsort(int* a, int n) { (void)a; (void)n; }\nint main() {\n  int sort_count = 0;\n  int a[2] = {2, 1};\n  merge_sort(a, 0, 1);\n  my_qsort(a, 2);\n  return sort_count;\n}'
      ]
    ];

    it.each(trapRows)('%s', async (_title, rule, code) => {
      const verdict = await checkHardRule(makeConstraint(rule), code);
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([]);
    });
  });

  describe('violations that MUST BE CAUGHT', () => {
    const violRows: Array<[string, string, string, EvidenceLine[]]> = [
      [
        'catches direct std::sort call and returns original 1-based line evidence',
        'Do not use `std::sort`.',
        cpp(
          '#include <algorithm>\n// header comment',
          '  int a[3] = {3, 1, 2};\n  std::sort(a, a + 3); // inline comment'
        ),
        [{ line: 5, text: 'std::sort(a, a + 3); // inline comment' }]
      ],
      [
        'catches unqualified sort() when using namespace std is declared',
        'Do not use `std::sort`.',
        cpp(
          '#include <algorithm>\nusing namespace std;',
          '  int a[3] = {3, 1, 2};\n  sort(a, a + 3);'
        ),
        [{ line: 5, text: 'sort(a, a + 3);' }]
      ],
      [
        'catches unqualified sort() when using std::sort declaration is present',
        'Do not use `std::sort`.',
        cpp(
          '#include <algorithm>\nusing std::sort;',
          '  int a[2] = {2, 1};\n  sort(a, a + 2);'
        ),
        [{ line: 5, text: 'sort(a, a + 2);' }]
      ],
      [
        'catches namespace alias usage like namespace s = std; s::sort(...)',
        'Do not use `std::sort`.',
        cpp(
          '#include <algorithm>\nnamespace s = std;',
          '  int a[2] = {2, 1};\n  s::sort(a, a + 2);'
        ),
        [{ line: 5, text: 's::sort(a, a + 2);' }]
      ],
      [
        'catches banned C functions like qsort',
        'Do not call `qsort`.',
        cpp(
          '#include <cstdlib>\nint cmp(const void* a, const void* b) { return *(int*)a - *(int*)b; }',
          '  int a[2] = {2, 1};\n  qsort(a, 2, sizeof(int), cmp);'
        ),
        [{ line: 5, text: 'qsort(a, 2, sizeof(int), cmp);' }]
      ],
      [
        'catches banned loop keywords like for and while',
        'Do not use `for` or `while`.',
        'int main() {\n  int s = 0;\n  for (int i = 0; i < 3; ++i) s += i;\n  while (s > 0) { --s; }\n  return s;\n}',
        [
          { line: 3, text: 'for (int i = 0; i < 3; ++i) s += i;' },
          { line: 4, text: 'while (s > 0) { --s; }' }
        ]
      ],
      [
        'catches banned member methods like rbegin',
        'Do not call `rbegin`.',
        '#include <vector>\nint main() {\n  std::vector<int> v = {1, 2};\n  auto it = v.rbegin();\n  return *it;\n}',
        [{ line: 4, text: 'auto it = v.rbegin();' }]
      ],
      [
        'catches #define macro aliases to banned functions',
        'Do not use `std::sort`.',
        cpp(
          '#include <algorithm>\n#define sneaky std::sort',
          '  int a[2] = {2, 1};\n  sneaky(a, a + 2);'
        ),
        [{ line: 5, text: 'sneaky(a, a + 2);' }]
      ]
    ];

    it.each(violRows)('%s', async (_title, rule, code, expectedEvidence) => {
      const verdict = await checkHardRule(makeConstraint(rule), code);
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual(expectedEvidence);
    });

    it('catches banned containers/types such as std::map or vector', async () => {
      const code = cpp(
        '#include <map>\n#include <vector>\nusing namespace std;',
        '  std::map<int, int> freq;\n  vector<int> vals;'
      );
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
