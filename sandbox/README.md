# LeeTKOB C++ sandbox

Phase 1–2 implementation for contract A.1. The public entry point is `judge()` from `@leetkob/sandbox`; its types come from `@leetkob/shared`. This package does not implement a worker, checker or deployment.

## Run and verify

From the repository root, with Node 20+ and Docker Linux Engine running:

```sh
npm ci --ignore-scripts
npm run build -w @leetkob/shared
npm run build -w @leetkob/sandbox
npm test -w @leetkob/sandbox
npm run lint -w @leetkob/sandbox
npm run format:check -w @leetkob/sandbox
npm run typecheck -w @leetkob/sandbox
```

The integration suite builds `leetkob-sandbox:pa3` from `sandbox/Dockerfile` before running. Missing Docker is a failure, not a skipped suite. The GCC 13 Bookworm base is pinned by digest. To build explicitly:

```sh
docker build -t leetkob-sandbox:pa3 sandbox
```

Runtime callers must build/provision this image first. An absent image or unreachable daemon raises `SandboxInfrastructureError`, allowing the future worker to retry. Compilation errors, wrong answers and resource violations return `JudgeOutcome` instead.

## Execution and boundaries

Compilation happens inside a container. Only the executable bytes leave it; every test receives a fresh container and scratch filesystem. Expected outputs stay in Node. The immutable C supervisor receives a length-framed source/executable through stdin, gives remaining stdin to the submitted program and classifies its actual process status. Student output is never parsed as trusted judge metadata, and a student exiting with a reserved supervisor code is still a runtime error.

Default limits for each execution are 2 CPU seconds, 5 wall seconds, 256 MiB memory, 64 processes and 65,536 combined stdout/stderr bytes. Per contract A.1 rule 4, compilation has a separate 10 CPU second / 20 wall second budget with the same memory, process and isolation restrictions. Compilation diagnostics are persisted only for `COMPILE_ERROR`, capped at 4,096 bytes. Executable transport has a separate 32 MiB ceiling. `durationMs` includes container orchestration.

The supervisor uses a CPU rlimit and cgroup v2 aggregate CPU accounting, including child processes; the Node watchdog kills the whole container on wall timeout. Memory classification uses cgroup OOM evidence and Docker state, not a guess from an exit code. The supported execution host is Linux Docker with cgroup v2 (including Docker Desktop Linux Engine).

Both compile and run use network none, UID/GID 1000, equal memory/memory-swap, a pids limit, a read-only root, no capabilities, no-new-privileges and no persistent container logs. A 64 MiB `tmpfs /work` is the only application scratch area and counts toward the container memory cap. No host folder, Docker socket or server environment is supplied. The supervisor constructs a minimal child environment; model credentials are never needed.

The runner removes its own container in `finally`, including after resource failures. It never scans and deletes other workers' containers. Recovery of containers left behind by a killed Node process requires the future worker to correlate container/job ownership and is outside phase 1–2.

Output comparison removes trailing spaces/tabs per line and trailing empty lines. Internal spaces, leading spaces and internal newlines remain significant. CRLF is normalized to LF. Evaluation stops at the first failed test, while `testsTotal` always reports the entire supplied test list.

## Student submissions and attack probes

`tests/fixtures/` contains six separately specified tasks and 36 complete labelled student attempts, plus three realistic resource mistakes. Test inputs and independent reference outputs live in `tests/fixtures/labs.ts`; they are not copied from the published evaluation set. See the fixture README for problem bounds and bug explanations.

`attacks/` contains nine bounded probes: CPU, wall, memory, output, process count, network, filesystem, host-data visibility and privilege escalation. The 1 GiB memory probe writes and reads each page through a volatile pointer so optimization cannot remove it. Process spawning is also bounded in the source even if policy enforcement breaks. Network testing targets only a controlled local listener, not a public service.

For filesystem/network/privilege probes, `ACCEPTED` means the probe printed the independently expected denial result; it does not mean an attack succeeded. Tests check both allowed scratch behavior and forbidden behavior. Resource failures are followed by an accepted submission, and the suite compares container inventories before/after to detect leaks.

No unit or integration test calls a model, uses database credentials or modifies the published dev set.
