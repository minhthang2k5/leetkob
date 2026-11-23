#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<int> a(n);
    for (int &x : a) cin >> x;
    bool swapped = true;
    while (swapped) {
        // Forgot to reset swapped=false at the beginning of each pass.
        for (int i = 1; i < n; ++i) {
            if (a[i - 1] > a[i]) { swap(a[i - 1], a[i]); swapped = true; }
        }
    }
    for (int i = 0; i < n; ++i) cout << (i ? " " : "") << a[i];
    cout << "\n";
}
