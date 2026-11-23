#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n;
    vector<long long> values(n);
    for (auto &x : values) cin >> x;
    long long total = accumulate(values.begin(), values.end(), 0LL);
    cout << sum << " " << *max_element(values.begin(), values.end()) << "\n";
}
