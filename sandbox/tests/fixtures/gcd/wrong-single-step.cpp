#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    long long a, b; cin >> a >> b;
    if (a < b) swap(a, b);
    if (!b) cout << a << "\n";
    else cout << (a % b ? a % b : b) << "\n"; // Stops after just one Euclid step.
}
