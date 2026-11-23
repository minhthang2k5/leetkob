#include <cstdint>
#include <iostream>
int main() {
    uint64_t seed; std::cin >> seed;
    volatile uint64_t state = seed;
    for (;;) state = state * 6364136223846793005ULL + 1;
}
