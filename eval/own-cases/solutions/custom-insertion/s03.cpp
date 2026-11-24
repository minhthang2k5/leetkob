#include <algorithm>
#include <iostream>

namespace my {
void sort(int* a, int n) {
  for (int i = 1; i < n; ++i) {
    int j = i;
    while (j > 0 && a[j - 1] > a[j]) {
      std::swap(a[j - 1], a[j]);
      --j;
    }
  }
}
}  // namespace my

int main() {
  int n;
  std::cin >> n;
  int a[1005];
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  my::sort(a, n);
  for (int i = 0; i < n; ++i) std::cout << (i ? " " : "") << a[i];
  return 0;
}
