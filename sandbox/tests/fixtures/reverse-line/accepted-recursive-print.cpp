#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

void print_reverse(const string &s, size_t count) {
    if (!count) return;
    cout << s[count - 1]; print_reverse(s, count - 1);
}
int main() {
    string s; getline(cin, s); print_reverse(s, s.size()); cout << "\n";
}
