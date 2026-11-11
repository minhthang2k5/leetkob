# AI Usage Log (AI-LOG.md)

CSC13114 · PA#2 LeeTKOB · Team AI Log

## 2026-11-08 — Team planning and role breakdown (PA#2)
Tool: Antigravity (Gemini 3.8 Flash).  
Asked for: analyze `PA2_TEAM_PLAN (1).md`, explain the scope, requirements, and break down tasks for a 3-person team.  
Kept: the sequential handover workflow (Package 0 through Package 4) to eliminate constant cross-team blocking.  
Changed: clarified responsibility boundaries so that N2 implements both unit and contract tests in Vitest + Supertest, while N3 focuses strictly on the API contract specification, test cases, and self-assessment report.  
Rejected: parallel work division originally conceived in earlier drafts; rejected because contract ambiguities would cause N2 and N1 to write conflicting code and CI gates simultaneously.

## 2026-11-09 — Drafting API contract and test specifications (PA#2 N3 Package 1)
Tool: Antigravity (Gemini 3.8 Flash).  
Asked for: draft `docs/contract/publish.md` and `docs/contract/publish-test-cases.md` from the project brief, rubric, and IA#3 `CONTRACT.md` template.  
Kept: 5-section layout from IA#3, RFC 9457 Problem Details format with `application/problem+json`, and domain constraints for the LeeTKOB Human Gate (100% violation, 100% unsure, 10% sampled pass).  
Changed: initial draft followed `CONTRACT.md` in requiring an `Idempotency-Key` header; changed to state-based idempotency because `POST /labs/{labId}/publish` has no variable body and operates on a designated resource URI.  
Rejected: generic error responses (`{ "error": "message" }`) and generic authorization ("authenticated"); replaced with strict tenancy ownership rules (TA assigned to the class).

## 2026-11-09 — Subagent review and security architecture audit
Tool: Antigravity (Research Subagent).  
Asked for: audit `docs/contract/publish.md` and `docs/contract/publish-test-cases.md` against the rubric and lecture slides.  
Kept: confirmation that the contract achieves the highest rubric band (21–25 pts) and covers the necessary deliberate break scenarios.  
Changed: in the contract's processing order, Resource Existence (`404`) was initially checked before Role Validation (`403`). Changed to reject `STUDENT` callers with `403 Forbidden` immediately before database lookups, preventing an information disclosure oracle where students could probe valid lab UUIDs.  
Rejected: initial 13 test cases lacked an extensibility test; added `CT-14` to explicitly test that unexpected request bodies are ignored without corrupting server state.

## 2026-11-09 — Backend Implementation and Contract Test Suite (PA#2 N2 Package 2)
Tool: Antigravity (Gemini 3.8 Flash).  
Asked for: create `ROADMAP.md`, folder structure isolated in `backend/`, Express + TypeScript backend, Prisma schema & seed data, RFC 9457 Problem Details middlewares, core `POST /v1/labs/:labId/publish` endpoint, and full 14 contract tests in Vitest + Supertest.  
Kept: `backend/` isolation, strict processing order enforcing role security before database lookup, atomic publication inside `prisma.$transaction`, and explicit verification of `Idempotent-Replayed: true` header.  
Changed: moved `compose.yaml` into `backend/` directory as requested by N2; structured `src/app.ts` to export the Express instance without starting the listener, allowing Supertest to execute in-memory tests cleanly.  
Rejected: combining dev and test databases into one schema; separated environment URLs in `.env.example` to ensure test runs never purge local development data.

## 2026-11-11 — Team lead (N1): audit of the repository against the brief, rubric and plan
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: compare the repository with the brief, the rubric, `requirement.txt` and `PA2_TEAM_PLAN.md`, and say what the packages of N2 and N3 still lacked.
Kept: the finding that the repo had no CI, `AGENTS.md`, branch protection, `PA2.md` or self-assessment, and that the contract and backend structure were sound.
Changed: the assistant ran the four checks on a fresh clone instead of trusting the handover: `format:check` was red on 15 files, there was no `package-lock.json`, and the tests could not run without a database.
Rejected: the handover's claim "14/14 tests green". With the database up the real result was 13/14 (CT-07 failed); the claim was not repeated anywhere.

## 2026-11-11 — Team lead (N1): fixes to the backend and test package (N2)
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: fix the problems found in the audit, one commit per kind of change.
Kept: the 14 contract tests, the problem-details helpers and the route structure; fixes went in as separate commits (`f7985fc`, `20603d2`, `b681c49`, `56e078f`, `47ceb68`, `6dde8bc`).
Changed: (a) CT-07 sent an id that is not a UUID v4, so the API correctly answered 400; the fixture was corrected in a test-only commit and the validator was then tightened from v1-5 to v4 in a separate commit. (b) The publish transition was read-then-write; it became one conditional `updateMany` (status = DRAFT) so two concurrent requests cannot overwrite `publishedAt`. (c) Tests used `DATABASE_URL` and `resetTestDatabase()` deletes every row; tests now use `TEST_DATABASE_URL` and the helper refuses any database whose name does not end in `_test`. (d) The first CT-15 used `vi.spyOn(prisma.lab, 'findUnique')`, which left the delegate returning `undefined` for later tests; it was changed to spy on `prisma.$transaction`.
Rejected: changing the test and the code in one commit to turn CT-07 green; leaving the validator at v1-5 and loosening the contract instead.

## 2026-11-11 — Team lead (N1): contract check against the IA#3 `CONTRACT.md`
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: compare `docs/contract/publish.md` with the IA#3 template and look for gaps.
Kept: the five-section layout of the contract; the template's rule that every `/v1` error is problem details.
Changed: the assistant probed the running app and found a malformed JSON body gave 500 and an unknown `/v1` path gave an HTML 404. The contract got the type `route-not-found` and the sentence that the publish body is never read (commit `7fa222e`); tests CT-16 and CT-17 were written first and seen failing (`1837f49`), then the code was fixed (`642c66f`).
Rejected: answering a malformed body with 400 `invalid-json` (the endpoint takes no body, so the body parser was removed instead).

## 2026-11-11 — Team lead (N1): `AGENTS.md` and the CI workflow
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: write the rules file with the three permission tiers and a workflow with the same four commands as local.
Kept: one job per check so each is its own required check; the table in `AGENTS.md` linking six rules to commits that really happened.
Changed: the first CI run on PR #1 failed the SonarCloud quality gate (rules S6505 and S8543: `npm ci` without `--ignore-scripts`, `npx`). The workflow now uses `npm ci --ignore-scripts` and `npm run prisma:generate` (commit `5172be0`), checked locally before pushing.
Rejected: making SonarCloud a required check (an outside tool unrelated to the contract could block the merge); writing the admin-may-publish rule as "confirmed by the product owners" (it is the team lead's decision; the contract says so).

## 2026-11-11 — Team lead (N1): branch protection and the red-to-green evidence
Tool: Claude Code (Claude Sonnet 5.5) for checking and for the evidence PR; the ruleset itself was set up by the team lead in the GitHub settings.
Asked for: review the ruleset screenshots and build one deliberate contract break.
Kept: the four required checks, 1 approval, empty bypass list, blocked force-push; the API record in `docs/evidence/main-protection-ruleset.json`.
Changed: the first ruleset screenshots showed enforcement Disabled and 0 targets; the assistant said they would prove `main` was unprotected, and after the fix the API showed it Active on `~DEFAULT_BRANCH`. For the break (PR #2, commit `2bea594`) the guard was commented out instead of using `if (false && ...)`, so ESLint stayed green and only CT-08 and CT-09 failed; the fix commit is `546c0e9`.
Rejected: merging PR #2 (it was closed unmerged); presenting the blocked PR as blocked by the red check alone (it also lacked its approval; `PA2.md` says both).

## 2026-11-11 — Team lead (N1): `PA2.md`, self-assessment and this log
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: write `PA2.md` and `SELF_ASSESSMENT_REPORT.md`, then raise the score where the rubric's top band is met.
Kept: scores tied to a file, commit, PR or run; the "what we did not manage" section.
Changed: the first draft claimed 90; criteria 1, 3, 4, 5 and 6 were raised to full marks (total 96).
Rejected: scoring 100 (an old template in the git history claimed 100 while branch protection did not exist yet); full marks for criterion 2 (`.env.example` has local default values and there is no model key or spending cap).
Note: commits made with the assistant up to PR #2 carry a `Co-Authored-By: Claude` trailer; from the evidence PR onward the team lead asked for it to be left out. AI use is recorded here.

## 2026-11-11 — Team lead (N1): value-free `.env.example`
Tool: Claude Code (Claude Sonnet 5.5).
Asked for: raise criterion 2 by making `.env.example` list every variable without values, without breaking a fresh clone.
Kept: the four variable names and the dev/test database split.
Changed: `.env.example` now holds names only, and a new `npm run init:env` fills the local development defaults into `.env` and never overwrites an existing one; checked on a fresh clone with all four checks green (20/20 tests).
Rejected: claiming a spending cap for a model key that does not exist (the assistant refused to word it that way); scoring criterion 2 at 10 (the self-score is 8).
