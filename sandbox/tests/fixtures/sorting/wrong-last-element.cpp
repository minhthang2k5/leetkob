#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<int> a(n);
    for (int &x : a) cin >> x;
    sort(a.begin(), a.end() - 1); // end() was already one past the last element.
    for (int i = 0; i < n; ++i) cout << (i ? " " : "") << a[i];
    cout << "\n";
}
