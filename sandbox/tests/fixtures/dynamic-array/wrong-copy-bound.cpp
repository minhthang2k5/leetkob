#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

int main() {
    int n; cin >> n; int capacity = 1; auto data = new long long[capacity]();
    for (int i = 0; i < n; ++i) {
        if (i == capacity) {
            int next = capacity * 2; auto grown = new long long[next]();
            copy(data, data + i - 1, grown); // Drops the last old element on each resize.
            delete[] data; data = grown; capacity = next;
        }
        cin >> data[i];
    }
    long long sum = 0, minimum = data[0];
    for (int i = 0; i < n; ++i) { sum += data[i]; minimum = min(minimum, data[i]); }
    cout << sum << " " << minimum << "\n"; delete[] data;
}
