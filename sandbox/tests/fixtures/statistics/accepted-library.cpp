#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n;
    vector<long long> a(n);
    for (auto &x : a) cin >> x;
    cout << accumulate(a.begin(), a.end(), 0LL) << " " << *max_element(a.begin(), a.end()) << "\n";
}
