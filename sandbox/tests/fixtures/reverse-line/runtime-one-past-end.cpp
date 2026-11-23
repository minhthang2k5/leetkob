#include <algorithm>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
using namespace std;

void print_reverse(const string &s, size_t index) {
    cout << s.at(index); // The caller passes size(), not size() - 1.
    if (index) print_reverse(s, index - 1);
}
int main() {
    string s; getline(cin, s); print_reverse(s, s.size()); cout << "\n";
}
