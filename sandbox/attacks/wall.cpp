#include <chrono>
#include <iostream>
#include <thread>
int main() {
    int seconds; std::cin >> seconds;
    std::this_thread::sleep_for(std::chrono::seconds(seconds));
    std::cout << "finished\n";
}
