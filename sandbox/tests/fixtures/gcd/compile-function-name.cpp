#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

long long euclid(long long a, long long b) { return b ? euclid(b, a % b) : a; }
int main() {
    long long a, b; cin >> a >> b; cout << greatest_common_divisor(a, b) << "\n";
}
