#include <cerrno>
#include <fcntl.h>
#include <fstream>
#include <iostream>
#include <unistd.h>
int main() {
    std::ofstream scratch("/work/student-note.txt"); scratch << "scratch"; scratch.close();
    std::ifstream readback("/work/student-note.txt"); std::string value; readback >> value;
    int fd = open("/readonly-probe/student-note.txt", O_CREAT | O_WRONLY, 0600);
    bool readonly = fd < 0 && errno == EROFS;
    if (fd >= 0) close(fd);
    std::cout << (value == "scratch" && readonly ? "isolated" : "writable-root") << "\n";
}
