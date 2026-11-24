#include <iostream>

void insertionSortRec(int* a, int n) {
  if (n <= 1) return;
  insertionSortRec(a, n - 1);
  int last = a[n - 1];
  int j = n - 2;
  while (j >= 0 && a[j] > last) {
    a[j + 1] = a[j];
    --j;
  }
  a[j + 1] = last;
}

int main() {
  int n;
  std::cin >> n;
  int a[1005];
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  insertionSortRec(a, n);
  for (int i = 0; i < n; ++i) std::cout << (i ? " " : "") << a[i];
  return 0;
}
