#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<long long> data; data.reserve(n);
    for (int i = 0; i < n; ++i) cin >> data.at(i);
    cout << accumulate(data.begin(), data.end(), 0LL) << " " << *min_element(data.begin(), data.end()) << "\n";
}
