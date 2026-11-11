# AGENTS.md — rules for AI assistants working on LeeTKOB

Read `docs/contract/publish.md` first: it is the specification. If code and contract
disagree, the code is wrong.

## 1. Stack

- Node.js 20, TypeScript (strict), Express 4, Prisma 5, PostgreSQL 16.
- Vitest + Supertest for tests; ESLint + Prettier for style.
- Everything lives in `backend/`. One endpoint so far: `POST /v1/labs/{labId}/publish`.
- Errors are RFC 9457 problem details (`application/problem+json`), types listed in the contract.

## 2. Commands

Run from `backend/`. These four are the quality gate; CI runs exactly these.

```bash
npm run lint
npm run format:check      # fix with: npm run format
npm run typecheck
npm test                  # needs: docker compose up -d, then once: npm run db:test:setup
```

Setup: `npm ci`, `cp .env.example .env`, `docker compose up -d`, `npx prisma generate`.

## 3. Conventions

- Work on a branch, open a PR, wait for green checks and one approval from another person. Never commit to `main` after protection is on.
- Contract first: to change behaviour, change `docs/contract/publish.md` in its own commit that says why, then the tests, then the code.
- Every error type in the contract has a test that checks status, `Content-Type` and the body (`type`, `title`, `code`, `instance`), not only the status.
- Tests use the database named by `TEST_DATABASE_URL` (name ends in `_test`). Never `DATABASE_URL`.
- Keep a state change compare-and-set in one statement (`updateMany ... where status = DRAFT`), not read-then-write.
- Run `npm run format` before committing. Files use LF line endings (`.gitattributes`).
- Say a check is green only after you ran it and saw the output.

## 4. Never

- Never put a secret in git, in `.env.example`, in a log or in a sandbox. `.env` stays ignored; `.env.example` lists names only. No model API key exists in PA#2.
- Never call a real model in a unit or contract test.
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

## Permissions for the assistant

| Tier | What |
|---|---|
| **Allowed** (no need to ask) | Read and edit code and docs inside the task. Write tests that follow the contract. Run the four checks. Create local branches and commits. |
| **Ask first** | Add or upgrade a dependency. Change the contract or the database schema. Push. Open or merge a PR. Deploy. Change branch protection or CI settings. Change anything outside the task. |
| **Never** | Everything in section 4. |
