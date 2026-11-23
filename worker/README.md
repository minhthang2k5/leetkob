# LeeTKOB Postgres worker

The worker consumes `submissions` from the existing PostgreSQL schema. API handlers only enqueue; `createWorker()` runs the sandbox and, for `ACCEPTED` submissions, the injected checker. No schema, Redis or HTTP endpoint is added.

## Build and run

From the repository root:

```sh
npm ci --ignore-scripts
npm run prisma:generate -w backend
npm run build:libs
npm run build -w @leetkob/worker
docker build -t leetkob-sandbox:pa3 sandbox
npm start -w @leetkob/worker
```

Supply `DATABASE_URL`, `WORKER_SAMPLE_SEED` and `MODEL_OFF=1` in the worker process environment. The seed must stay stable across restarts to preserve the PASS review sample. `LAB_COST_CAP_USD` is optional (default 3 USD); agree the production amount with N2. The CLI does not load `backend/.env` automatically. Never supply these variables or model credentials to student containers.

**Current integration prerequisite:** `@leetkob/checker.checkSubmission()` still throws its not-implemented error. The CLI calls that real export, so an accepted job currently retries and ultimately fails until N2 implements it, including its model-off path. It never silently substitutes the test checker. The CLI rejects model-on configuration until N2 provides its model adapter; programmatic callers can already inject a `SemanticJudge` through `checkOptions.judge`.

Programmatic integration uses `new SubmissionStore(prisma)`, `createWorker(store, deps, options)` and `worker.run(abortSignal)`. `defaultDeps` uses the real sandbox/checker plus Docker attempt discovery/cleanup. Tests inject their checker explicitly; it is not a production fallback.

## Queue and persistence

- Claim uses a short transaction and `FOR UPDATE SKIP LOCKED`, oldest submission first. A lab row lock plus a fresh check of RUNNING jobs permits one healthy attempt per lab; other labs can run concurrently in other worker processes. No transaction stays open during judging or model calls.
- Each claim increments `attempts`. The owner renews `lockedAt` every 15 seconds. After two minutes without a heartbeat, another worker requeues the job, or marks the third abandoned attempt FAILED. Ownership checks include submission id, attempt and RUNNING status; an expired lease cannot be renewed.
- Tests are read by `TestCase.position`. Checker input contains only original code, statement, and constraint id/code/text. Deductions and student identity stay in the DB. The checker owns comment removal, evidence validation, model timeout and cost-cap decisions.
- Completion atomically stores the sandbox outcome, verdicts, model-call logs and JUDGED status after checking the lease. Verdicts are unique per submission/constraint. A conditional write preserves a TA review even if it commits while the worker waits for a row lock.
- PASS sampling is a SHA-256 hash of seed, submission id and constraint id, with a 10% threshold. It is deterministic Bernoulli sampling; a small lab need not have exactly one in ten PASS verdicts sampled.
- Existing costs for the lab are summed immediately before checking and supplied as `labSpentUsd`/`labCapUsd`. A provider/request id replay is deduplicated within a submission. A crash after a provider call but before its DB commit can still incur an unrecorded charge and another call after recovery; this is not an exactly-once provider or strict billing guarantee.
- Wrong answers, compile errors and resource violations finish as JUDGED without calling the checker. Infrastructure/checker/persistence errors retry up to three total attempts, then FAILED. Stored errors and emitted events contain worker-owned codes, never raw exception messages, code or credentials.

SIGINT/SIGTERM stops new claims and allows the active job ten seconds to drain. After that the worker cancels its sandbox or discards a late checker reply and requeues unfinished work. The checker interface cannot cancel an already dispatched provider request. Hard process death is recovered through lease expiry.

Containers are labelled with submission id and attempt, scoped through async context without changing `judge()`'s contract. Startup reconciliation removes only attempts no longer owned in PostgreSQL. It preserves another worker's live lease; unscoped legacy containers are left alone. Every regular run also recovers expired jobs and cleans those attempts. Student containers retain all existing isolation flags and never receive a host mount, Docker socket or worker environment.

## Verification

Use only a database named with the `_test` suffix through `TEST_DATABASE_URL`. With PostgreSQL and Docker Linux Engine running:

```sh
docker compose -f backend/compose.yaml up -d
npm run db:test:setup -w backend
npm run build:libs
npm test -w @leetkob/worker
```

The test setup optionally reads the local `backend/.env` for `TEST_DATABASE_URL`, then verifies its name before selecting it. Test files run serially because they reset the same test DB. They must not overlap another suite using that DB.

The queue tests use real PostgreSQL connections and controlled dependency gates. The process/API tests run real Express HTTP requests, spawned Node workers (including SIGKILL), GCC/Docker and complete sorting submissions from the sandbox fixtures. Only constraint checking is fake. The suite builds libraries and the worker for child processes and prepares the sandbox image; missing prerequisites fail rather than skip. See [the verification report](VERIFICATION.md) for actual results.

Before production E2E, N2 must implement and connect the checker. N0 must also settle the existing publish behavior while submissions are QUEUED/RUNNING: the current API counts pending verdict reviews only. This worker change does not alter that policy. The tested review/publish flow begins after judging has completed. Deployment remains a separate step.
