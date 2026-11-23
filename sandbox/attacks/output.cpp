#include <iostream>
int main() {
    long long n; std::cin >> n;
    // Represents an unbounded diagnostic stream, on both output channels.
    for (long long i = 0; i < n; ++i) {
        std::cout << "iteration " << i << ": tracing calculation\n";
        std::cerr << "debug detail for iteration " << i << "\n";
    }
}
