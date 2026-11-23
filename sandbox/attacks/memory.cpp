#include <cstdlib>
#include <iostream>
int main() {
    const size_t bytes = 1024ULL * 1024 * 1024;
    volatile unsigned char *data = static_cast<unsigned char *>(std::malloc(bytes));
    if (!data) return 1;
    unsigned long long checksum = 0;
    for (size_t i = 0; i < bytes; i += 4096) {
        data[i] = static_cast<unsigned char>((i / 4096) % 251 + 1);
        checksum += data[i]; // Read every touched page; volatile prevents dead-store removal at -O2.
    }
    std::cout << checksum << "\n";
    std::free(const_cast<unsigned char *>(data));
}
