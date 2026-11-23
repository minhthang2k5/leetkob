#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<int> a(n);
    for (int &x : a) cin >> x;
    for (int i = 1; i < n; ++i) {
        int x = a[i], j = i;
        while (j > 0 && a[j - 1] > x) { a[j] = a[j - 1]; --j; }
        a[j] = x;
    }
    for (int i = 0; i < n; ++i) cout << (i ? " " : "") << a[i];
    cout << "\n";
}
