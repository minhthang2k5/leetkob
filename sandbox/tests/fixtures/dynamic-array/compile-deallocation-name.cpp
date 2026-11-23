#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; auto data = new long long[n];
    for (int i = 0; i < n; ++i) cin >> data[i];
    cout << accumulate(data, data + n, 0LL) << " " << *min_element(data, data + n) << "\n";
    delete[] storage;
}
