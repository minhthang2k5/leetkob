#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

/* Exit codes are emitted by this immutable supervisor, never trusted from a student. */
enum { COMPILE_ERROR = 10, CPU_LIMIT = 11, MEMORY_LIMIT = 12, RUNTIME_ERROR = 13, INTERNAL = 14 };

static unsigned long long metric(const char *file, const char *key) {
    FILE *f = fopen(file, "r");
    if (!f) return 0;
    char line[256], name[128]; unsigned long long value = 0;
    while (fgets(line, sizeof(line), f)) {
        unsigned long long n;
        if (sscanf(line, "%127s %llu", name, &n) == 2 && strcmp(name, key) == 0) { value = n; break; }
    }
    fclose(f); return value;
}

/* Read exactly the artifact frame; leave the remaining stdin for the student's input. */
static int receive_artifact(const char *path, size_t limit) {
    char header[32]; size_t h = 0; char c;
    while (h < sizeof(header) - 1) {
        if (read(STDIN_FILENO, &c, 1) != 1) return -1;
        if (c == '\n') break;
        if (c < '0' || c > '9') return -1;
        header[h++] = c;
    }
    if (!h || c != '\n') return -1;
    header[h] = 0; unsigned long long length = strtoull(header, NULL, 10);
    if (length > limit) return -1;
    int fd = open(path, O_CREAT | O_TRUNC | O_WRONLY | O_NOFOLLOW, 0700);
    if (fd < 0) return -1;
    char buffer[16384];
    while (length) {
        size_t wanted = length < sizeof(buffer) ? (size_t)length : sizeof(buffer);
        ssize_t n = read(STDIN_FILENO, buffer, wanted);
        if (n <= 0) { close(fd); return -1; }
        ssize_t written = 0;
        while (written < n) {
            ssize_t k = write(fd, buffer + written, (size_t)(n - written));
            if (k <= 0) { close(fd); return -1; }
            written += k;
        }
        length -= (unsigned long long)n;
    }
    return close(fd);
}

int main(int argc, char **argv) {
    if (argc != 3) return INTERNAL;
    const int compile = strcmp(argv[1], "compile") == 0;
    if (!compile && strcmp(argv[1], "run") != 0) return INTERNAL;
    int cpu = atoi(argv[2]); if (cpu < 1) return INTERNAL;
    /* The student must not ptrace or write /proc/<supervisor>/mem even at the same uid. */
    if (prctl(PR_SET_DUMPABLE, 0) != 0) return INTERNAL;
    if (receive_artifact(compile ? "/work/main.cpp" : "/work/program", compile ? 65536 : 33554432) != 0) return INTERNAL;
    unsigned long long cpu_start = metric("/sys/fs/cgroup/cpu.stat", "usage_usec");
    unsigned long long oom_start = metric("/sys/fs/cgroup/memory.events", "oom_kill");
    pid_t child = fork();
    if (child < 0) return INTERNAL;
    if (child == 0) {
        if (setpgid(0, 0) != 0) _exit(INTERNAL);
        if (prctl(PR_SET_DUMPABLE, 0) != 0) _exit(INTERNAL);
        struct rlimit r = { (rlim_t)cpu, (rlim_t)cpu + 1 };
        if (setrlimit(RLIMIT_CPU, &r) != 0) _exit(INTERNAL);
        char *env[] = { "PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C", "LC_ALL=C", "TMPDIR=/work", NULL };
        if (compile) {
            if (dup2(STDERR_FILENO, STDOUT_FILENO) < 0) _exit(INTERNAL);
            char *args[] = { "g++", "-std=c++17", "-O2", "-pipe", "/work/main.cpp", "-o", "/work/program", NULL };
            execve("/usr/local/bin/g++", args, env);
        } else {
            char *args[] = { "/work/program", NULL };
            execve(args[0], args, env);
        }
        _exit(INTERNAL);
    }
    int status = 0;
    for (;;) {
        pid_t finished = waitpid(child, &status, WNOHANG);
        if (finished == child) break;
        if (finished < 0 && errno != EINTR) return INTERNAL;
        unsigned long long used = metric("/sys/fs/cgroup/cpu.stat", "usage_usec") - cpu_start;
        if (used >= (unsigned long long)cpu * 1000000) { kill(-child, SIGKILL); return CPU_LIMIT; }
        struct timespec delay = { 0, 10000000 }; nanosleep(&delay, NULL);
    }
    if (metric("/sys/fs/cgroup/memory.events", "oom_kill") > oom_start) return MEMORY_LIMIT;
    if (WIFSIGNALED(status) && WTERMSIG(status) == SIGXCPU) return CPU_LIMIT;
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) return compile ? COMPILE_ERROR : RUNTIME_ERROR;
    if (!compile) return 0;
    int artifact = open("/work/program", O_RDONLY | O_NOFOLLOW);
    if (artifact < 0) return INTERNAL;
    char bytes[16384]; ssize_t n;
    while ((n = read(artifact, bytes, sizeof(bytes))) > 0) {
        ssize_t written = 0;
        while (written < n) {
            ssize_t k = write(STDOUT_FILENO, bytes + written, (size_t)(n - written));
            if (k <= 0) { close(artifact); return INTERNAL; }
            written += k;
        }
    }
    close(artifact); return n < 0 ? INTERNAL : 0;
}
