#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n, q; cin >> n >> q; vector<int> a(n);
    for (int &x : a) cin >> x;
    while (q--) {
        int x; cin >> x; int lo = 0, hi = n;
        while (lo < hi) { int m = lo + (hi - lo) / 2; if (a[m] < x) lo = m + 1; else hi = m; }
        cout << (lo < n && a[lo] == x ? lo : -1) << "\n";
    }
}
