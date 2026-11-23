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
        int x; cin >> x; int p = int(upper_bound(a.begin(), a.end(), x) - a.begin()) - 1;
        cout << (p >= 0 && a[p] == x ? p : -1) << "\n";
    }
}
