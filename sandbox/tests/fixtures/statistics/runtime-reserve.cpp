#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n;
    vector<long long> a;
    a.reserve(n); // reserve allocates capacity but does not create elements.
    for (int i = 0; i < n; ++i) cin >> a.at(i);
    cout << accumulate(a.begin(), a.end(), 0LL) << " " << *max_element(a.begin(), a.end()) << "\n";
}
