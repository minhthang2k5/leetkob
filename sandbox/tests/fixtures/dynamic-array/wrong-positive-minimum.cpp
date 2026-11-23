#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<long long> data;
    for (int i = 0; i < n; ++i) { long long x; cin >> x; data.push_back(x); }
    long long sum = 0, minimum = 0;
    for (auto x : data) { sum += x; minimum = min(minimum, x); }
    cout << sum << " " << minimum << "\n";
}
