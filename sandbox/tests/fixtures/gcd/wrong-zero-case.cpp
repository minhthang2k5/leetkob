#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

long long euclid(long long a, long long b) { return b ? euclid(b, a % b) : a; }
int main() {
    long long a, b; cin >> a >> b;
    if (a == 0 || b == 0) cout << 0 << "\n";
    else cout << euclid(a, b) << "\n";
}
