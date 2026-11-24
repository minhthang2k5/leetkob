#include <algorithm>
#include <iostream>

int main() {
  int n;
  std::cin >> n;
  int a[1005];
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  std::sort(a, a + n);
  for (int i = 0; i < n; ++i) std::cout << (i ? " " : "") << a[i];
  return 0;
}
