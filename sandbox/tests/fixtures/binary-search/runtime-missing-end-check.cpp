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
        int x; cin >> x; size_t p = lower_bound(a.begin(), a.end(), x) - a.begin();
        cout << (a.at(p) == x ? int(p) : -1) << "\n";
    }
}
