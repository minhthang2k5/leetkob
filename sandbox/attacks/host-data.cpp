#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sys/stat.h>
int main() {
    std::string host_path; std::getline(std::cin, host_path);
    std::ifstream host_file(host_path);
    struct stat info{};
    bool socket_visible = stat("/var/run/docker.sock", &info) == 0;
    bool env_visible = std::getenv("LEETKOB_TEST_CANARY") != nullptr;
    std::cout << (!host_file.good() && !socket_visible && !env_visible ? "absent" : "leaked") << "\n";
}
