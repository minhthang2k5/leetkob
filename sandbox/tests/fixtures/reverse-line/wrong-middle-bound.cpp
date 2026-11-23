#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

void reverse_text(string &s, int lo, int hi) {
    if (lo >= hi) return;
    swap(s[lo], s[hi]); reverse_text(s, lo + 1, hi - 1);
}
int main() {
    string s; getline(cin, s); reverse_text(s, 0, int(s.size()) - 2); cout << s << "\n";
}
