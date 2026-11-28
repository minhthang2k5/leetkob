#include <iostream>

int main() {
  int n;
  std::cin >> n;
  int a[1005];
  int* aux = new int[n];
  for (int i = 0; i < n; ++i) std::cin >> a[i];
  for (int i = 0; i < n; ++i) {
    int minIdx = i;
    for (int j = i + 1; j < n; ++j) {
      if (a[j] < a[minIdx]) minIdx = j;
    }
    int t = a[i];
    a[i] = a[minIdx];
    a[minIdx] = t;
    aux[i] = a[i];
  }
  for (int i = 0; i < n; ++i) std::cout << (i ? " " : "") << aux[i];
  delete[] aux;
  return 0;
}
