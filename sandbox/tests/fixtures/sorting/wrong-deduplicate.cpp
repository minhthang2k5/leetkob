#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<int> a(n);
    for (int &x : a) cin >> x;
    sort(a.begin(), a.end());
    a.erase(unique(a.begin(), a.end()), a.end()); // Mistakes sorting for making a set.
    for (size_t i = 0; i < a.size(); ++i) cout << (i ? " " : "") << a[i];
    cout << "\n";
}
