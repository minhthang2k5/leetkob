import { describe, expect, it } from 'vitest';
import type { CheckConstraint } from '@leetkob/shared';
import { checkHardRule } from '../src/hard-rules';

function makeConstraint(text: string, code = 'C1'): CheckConstraint {
  return { id: `id-${code}`, code, text };
}

describe('AST hard rules (trap cases & positive violations)', () => {
  describe('traps that MUST PASS', () => {
    it('allows student-defined sort function in global scope', async () => {
      const code = [
        '#include <iostream>',
        'void sort(int* a, int n) {',
        '  for (int i = 0; i < n; ++i) {}',
        '}',
        'int main() {',
        '  int a[3] = {3, 1, 2};',
        '  sort(a, 3);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([]);
    });

    it('allows student-defined sort in a custom namespace even with using namespace std', async () => {
      const code = [
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
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([]);
    });

    it('allows member function named sort on a student struct/class', async () => {
      const code = [
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
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.evidence).toEqual([]);
    });

    it('ignores banned names inside comments and string literals', async () => {
      const code = [
        '#include <iostream>',
        '// std::sort(a, a + n);',
        '/* qsort(a, n, sizeof(int), cmp); */',
        'int main() {',
        '  std::cout << "std::sort(a, a + n)" << "\\n";',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort` or `qsort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.evidence).toEqual([]);
    });

    it('allows #include <algorithm> when only std::swap is called', async () => {
      const code = [
        '#include <algorithm>',
        'int main() {',
        '  int x = 1, y = 2;',
        '  std::swap(x, y);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.evidence).toEqual([]);
    });

    it('does not match substring identifiers like merge_sort or sort_count', async () => {
      const code = [
        'void merge_sort(int* a, int l, int r) { (void)a; (void)l; (void)r; }',
        'void my_qsort(int* a, int n) { (void)a; (void)n; }',
        'int main() {',
        '  int sort_count = 0;',
        '  int a[2] = {2, 1};',
        '  merge_sort(a, 0, 1);',
        '  my_qsort(a, 2);',
        '  return sort_count;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort` or `qsort`.'),
        code
      );
      expect(verdict.verdict).toBe('PASS');
      expect(verdict.evidence).toEqual([]);
    });
  });

  describe('violations that MUST BE CAUGHT', () => {
    it('catches direct std::sort call and returns original 1-based line evidence', async () => {
      const code = [
        '#include <algorithm>',
        '// header comment',
        'int main() {',
        '  int a[3] = {3, 1, 2};',
        '  std::sort(a, a + 3); // inline comment',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([
        { line: 5, text: 'std::sort(a, a + 3); // inline comment' }
      ]);
    });

    it('catches unqualified sort() when using namespace std is declared', async () => {
      const code = [
        '#include <algorithm>',
        'using namespace std;',
        'int main() {',
        '  int a[3] = {3, 1, 2};',
        '  sort(a, a + 3);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence).toEqual([{ line: 5, text: 'sort(a, a + 3);' }]);
    });

    it('catches unqualified sort() when using std::sort declaration is present', async () => {
      const code = [
        '#include <algorithm>',
        'using std::sort;',
        'int main() {',
        '  int a[2] = {2, 1};',
        '  sort(a, a + 2);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.source).toBe('HARD_RULE');
      expect(verdict.evidence.some((e) => e.line === 5)).toBe(true);
    });

    it('catches namespace alias usage like namespace s = std; s::sort(...)', async () => {
      const code = [
        '#include <algorithm>',
        'namespace s = std;',
        'int main() {',
        '  int a[2] = {2, 1};',
        '  s::sort(a, a + 2);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(
        makeConstraint('Do not use `std::sort`.'),
        code
      );
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.evidence).toEqual([
        { line: 5, text: '  s::sort(a, a + 2);'.trim() }
      ]);
    });

    it('catches banned C functions like qsort', async () => {
      const code = [
        '#include <cstdlib>',
        'int cmp(const void* a, const void* b) { return *(int*)a - *(int*)b; }',
        'int main() {',
        '  int a[2] = {2, 1};',
        '  qsort(a, 2, sizeof(int), cmp);',
        '  return 0;',
        '}'
      ].join('\n');

      const verdict = await checkHardRule(makeConstraint('Do not call `qsort`.'), code);
      expect(verdict.verdict).toBe('VIOLATION');
      expect(verdict.evidence).toEqual([
        { line: 5, text: 'qsort(a, 2, sizeof(int), cmp);' }
      ]);
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
