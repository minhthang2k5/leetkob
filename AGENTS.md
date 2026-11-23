# AGENTS.md — rules for AI assistants working on LeeTKOB

Read `docs/contract/publish.md` and `docs/contract/pa3-interfaces.md` first: they are the specification. If code and contract
disagree, the code is wrong.

## 1. Stack

- Node.js 20, TypeScript (strict), Express 4, Prisma 5, PostgreSQL 16.
- Vitest + Supertest for tests; ESLint + Prettier for style.
- npm workspaces at the repo root: `shared/` (types), `sandbox/`, `checker/`, `worker/`, `backend/`.
  `frontend/` (React + Vite) has its own lockfile and is not a workspace yet.
- Errors are RFC 9457 problem details (`application/problem+json`), types listed in the contract.
- Judging: the API only queues a submission; the worker runs `judge()` in the Docker sandbox, then
  `checkSubmission()` (hard rules, then one model call for semantic constraints, guardrails in the checker).
  The model provider is Anthropic; the key lives only in the backend/worker environment of the deployment.
- Owners: N0 backend, DB, CI, frontend; N1 `sandbox/`, `worker/`, deploy; N2 `checker/`, `eval/`.
  Change another owner's folder only in a PR they review.

## 2. Commands

Run from the repo root; each runs in every workspace. These four are the quality gate on `main`; CI runs exactly these.

```bash
npm run lint
npm run format:check      # fix with: npm run format
npm run typecheck
npm test                  # backend needs: docker compose up -d, then once: npm run db:test:setup -w backend
```

CI also runs, as their own jobs (`.github/workflows/ci.yml`):

```bash
cd frontend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
npm test -w @leetkob/sandbox                # job "sandbox": the attack submissions, needs Docker
MODEL_OFF=1 npm test -w @leetkob/checker     # job "checker": no network, no key
node scripts/check-eval-data.mjs            # job "eval-data": dev set SHA-256; required on the pa3 tag
```

Setup: `npm ci` at the root, then in `backend/`: `npm run init:env`, `docker compose up -d`, `npm run prisma:generate`.
Test accounts: `npm run db:seed:accounts -w backend` with the `SEED_PASSWORD_*` variables set.

## 3. Conventions

- Work on a branch, open a PR, wait for green checks and one approval from another person. Never commit to `main` after protection is on.
- Contract first: to change behaviour, change `docs/contract/publish.md` or `docs/contract/pa3-interfaces.md` in its own commit that says why, then the tests, then the code.
- One part per commit (sandbox, queue, hard rules, model call, limits), with its tests in the same commit or before (rubric criterion 7).
- Every error type in the contract has a test that checks status, `Content-Type` and the body (`type`, `title`, `code`, `instance`), not only the status.
- Tests use the database named by `TEST_DATABASE_URL` (name ends in `_test`). Never `DATABASE_URL`.
- Keep a state change compare-and-set in one statement (`updateMany ... where status = DRAFT`), not read-then-write.
- Run `npm run format` before committing. Files use LF line endings (`.gitattributes`).
- Say a check is green only after you ran it and saw the output.

## 4. Never

- Never put a secret in git, in `.env.example`, in a log or in a sandbox. `.env` stays ignored; `.env.example` lists names only.
- Never put the model API key in the repo, CI, the frontend, the sandbox image or its environment, or a log. It exists only in the backend/worker environment of the deployment and on N2's machine for the dev-set run.
- Never call a real model in a unit or contract test; use `FakeJudge`.
- Never edit anything under `eval/leetkob-eval/` (`eval.mjs`, `labels.jsonl`, the `.cpp` files): it stays byte-identical to the published dev set. `scripts/check-eval-data.mjs` checks the SHA-256 (`eval.mjs` starts `c836edd8713521bb`, `labels.jsonl` starts `262cda7b0ef5612e`).
- Never name or quote a dev-set case (an id such as `sort-merge/s05`, or its code) in a prompt, a hard rule or a checker test. That is tuning on the dev set.
- Never loosen a test, a case or a label in the commit that makes it pass.
- Never start the sandbox with `-v` (host folders, `/var/run/docker.sock`), `--privileged`, `--env-file` or `-e`. Always `--network none`, a non-root user, memory equal to memory-swap, a pids limit, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`; compile inside the sandbox too.
- Never accept a memory-limit attack test that does not read the memory back: the compiler removes an allocation nobody reads.
- Never call a dev-set run "real" if its call log has no request id from the provider: that run used a mock.
- Never judge inside a request handler (the API only queues), never send comments or a student's identity to the model, never let anything but the TA set a deduction, and never publish while a required review is pending.
- Never edit a test, a fixture, the eval data or a label just to make a check pass. If a test is wrong, show where the contract says so, change the contract first, and put that in a separate commit.
- Never skip or bypass checks to merge (`--no-verify`, admin override, force-push to `main`, deleting a failing test).
- Never run tests against the dev database.
- Never write "done" or "14/14 green" for something you did not run.

Why these exist (each one happened in this repo):

| Rule | What went wrong | Where to see it |
|---|---|---|
| Never edit a test to pass; contract first | CT-07 used an id that was not a UUID v4. The handover said 14/14 green, a real run gave 13/14. The fixture was fixed only after checking it against the contract. | `20603d2`, `HANDOVER.md` section 5 |
| Tests use `TEST_DATABASE_URL`, never dev | The tests read `DATABASE_URL` and `resetTestDatabase()` deletes every row, so a test run could wipe dev data. | `47ceb68` |
| Compare-and-set for state changes | Publish read the lab, then updated it unconditionally; two concurrent requests could overwrite `publishedAt`. | `56e078f` |
| Check the body of every error, every `/v1` error is problem details | A malformed body returned 500 and an unknown route returned HTML 404 although the contract required problem details. | `1837f49`, `642c66f` |
| Run `format` before commit; LF endings | `format:check` was red on 15 files. | `f7985fc` |
| Only say green after running | The handover reported results nobody had run. | `HANDOVER.md` section 5 |
| A test that never fails proves nothing | The concurrent-submission test (SB-08) was checked by removing the lock: 4 of 4 requests then got through, so the test does catch the race. | `925a79f` |
| Fixtures follow the contract, in their own commit | The PA#2 class ids were not UUID v4, so the new `/v1/classes/{classId}` routes answered 400; the fixture was fixed alone, citing contract B.1. | `7593c1d` |

From the PA#3 rubric ("catching the assistant"; graders check each one):

| Sign | Means | How they check |
|---|---|---|
| `eval.mjs`, `labels.jsonl` or a dev `.cpp` changed | moving the goalposts | SHA-256 prefixes above |
| A prompt or hard rule names `sort-merge/s05` or quotes dev-set code | tuning on the dev set | search prompts and rules for dev-set ids |
| A test or case loosened in the commit that turns it green | editing the test to pass | `git log -p` |
| A 1 GiB test passes without reading the memory back | the compiler dropped the allocation | criterion 2, item 4 |
| `-v /var/run/docker.sock`, `--privileged`, `--env-file`, `-e MODEL_API_KEY` on the sandbox command | sandbox minimums lost | attack submissions |
| A "real" dev run whose call log has no provider request id | the model was mocked | criterion 4 |

## Permissions for the assistant

| Tier | What |
|---|---|
| **Allowed** (no need to ask) | Read and edit code and docs inside the task. Write tests that follow the contract. Run the four checks. Create local branches and commits. |
| **Ask first** | Add or upgrade a dependency. Change the contract or the database schema. Push. Open or merge a PR. Deploy. Change branch protection or CI settings. Change anything outside the task. |
| **Never** | Everything in section 4. |
