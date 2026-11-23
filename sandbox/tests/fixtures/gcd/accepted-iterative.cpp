#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    long long a, b; cin >> a >> b;
    while (b) { long long r = a % b; a = b; b = r; }
    cout << a << "\n";
}
