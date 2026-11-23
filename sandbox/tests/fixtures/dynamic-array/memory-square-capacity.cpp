#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n;
    // Misunderstands a one-dimensional capacity as a table of n by n elements.
    vector<long long> data(static_cast<size_t>(n) * n);
    for (int i = 0; i < n; ++i) cin >> data[i];
    long long checksum = accumulate(data.begin(), data.end(), 0LL);
    cout << checksum << " " << *min_element(data.begin(), data.begin() + n) << "\n";
}
