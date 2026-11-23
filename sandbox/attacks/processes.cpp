#include <cerrno>
#include <iostream>
#include <sys/wait.h>
#include <unistd.h>
int main() {
    bool limited = false;
    // Bounded even if the sandbox policy is broken; never a host-wide fork bomb.
    for (int i = 0; i < 128; ++i) {
        pid_t child = fork();
        if (child == 0) { usleep(300000); _exit(0); }
        if (child < 0) { limited = errno == EAGAIN; break; }
    }
    while (wait(nullptr) > 0) {}
    std::cout << (limited ? "limited" : "unrestricted") << "\n";
}
