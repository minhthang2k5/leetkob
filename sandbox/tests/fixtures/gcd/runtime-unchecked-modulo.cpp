#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    long long a, b; cin >> a >> b;
    do { long long r = a % b; a = b; b = r; } while (b); // Fails when input b is zero.
    cout << a << "\n";
}
