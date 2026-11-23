#include <cerrno>
#include <fstream>
#include <iostream>
#include <string>
#include <sys/prctl.h>
#include <unistd.h>
int main() {
    bool nonroot = geteuid() == 1000;
    bool denied = setuid(0) == -1 && errno == EPERM;
    bool no_new_privileges = prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) == 1;
    std::ifstream status("/proc/self/status");
    std::string line; bool no_caps = false;
    while (std::getline(status, line)) {
        if (line.find("CapEff:") == 0) no_caps = line.find("0000000000000000") != std::string::npos;
    }
    std::cout << (nonroot && denied && no_new_privileges && no_caps ? "unprivileged" : "escalated") << "\n";
}
