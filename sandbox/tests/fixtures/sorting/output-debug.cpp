#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; vector<int> a(n);
    for (int &x : a) cin >> x;
    for (int end = n; end > 1; --end) {
        for (int i = 1; i < end; ++i) {
            if (a[i - 1] > a[i]) swap(a[i - 1], a[i]);
            // A student's temporary trace accidentally remains in the submission.
            for (int x : a) cout << x << " ";
            cout << "\n";
        }
    }
    for (int i = 0; i < n; ++i) cout << (i ? " " : "") << a[i];
    cout << "\n";
}
