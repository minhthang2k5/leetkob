#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<long long> data;
    for (int i = 0; i < n; ++i) { long long x; cin >> x; data.push_back(x); }
    cout << accumulate(data.begin(), data.end(), 0LL) << " " << *min_element(data.begin(), data.end()) << "\n";
}
