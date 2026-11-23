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
        int x; cin >> x;
        auto p = lower_bound(a.begin(), a.end(), x)
        cout << (p != a.end() && *p == x ? int(p - a.begin()) : -1) << "\n";
    }
}
