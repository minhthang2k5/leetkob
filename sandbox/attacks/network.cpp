#include <arpa/inet.h>
#include <ifaddrs.h>
#include <iostream>
#include <net/if.h>
#include <sys/socket.h>
#include <unistd.h>
int main() {
    int port; std::cin >> port;
    // A refused localhost connection alone would also happen on bridge networking.
    // Verify that the namespace has no non-loopback interface as well.
    ifaddrs *interfaces = nullptr;
    if (getifaddrs(&interfaces) != 0) return 1;
    bool isolated = true;
    for (ifaddrs *current = interfaces; current; current = current->ifa_next) {
        if (!(current->ifa_flags & IFF_LOOPBACK)) isolated = false;
    }
    freeifaddrs(interfaces);
    if (!isolated) { std::cout << "network-visible\n"; return 0; }
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { std::cout << "denied\n"; return 0; }
    sockaddr_in address{}; address.sin_family = AF_INET; address.sin_port = htons(port);
    inet_pton(AF_INET, "127.0.0.1", &address.sin_addr);
    int result = connect(fd, reinterpret_cast<sockaddr *>(&address), sizeof(address));
    close(fd);
    std::cout << (result == 0 ? "connected" : "denied") << "\n";
}
