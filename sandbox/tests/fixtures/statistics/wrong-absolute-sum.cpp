#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n;
    long long sum = 0, maximum = -1000000001LL;
    for (int i = 0; i < n; ++i) {
        long long x; cin >> x; sum += abs(x); maximum = max(maximum, x);
    }
    cout << sum << " " << maximum << "\n";
}
