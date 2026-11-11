# PA#2 — Harness and quality gate (LeeTKOB)

CSC13114 · class 2609-AWAD-23/3 · due 2026-11-11 22:00

Endpoint under contract: `POST /v1/labs/{labId}/publish`. Backend in `backend/`, contract in `docs/contract/publish.md`.

## Links

| What the rubric asks for | Link |
|---|---|
| Repository (public) | https://github.com/minhthang2k5/leetkob |
| Protected-branch settings | Ruleset `Protect-main`, Active, no bypass: https://github.com/minhthang2k5/leetkob/rules/27026766 (visible to repo admins). Screenshots and the API record of the saved ruleset: [`docs/evidence/`](docs/evidence/README.md) |
| Blocked PR (a red check stopped the merge) | https://github.com/minhthang2k5/leetkob/pull/2 — screenshot of the blocked state: [`docs/evidence/blocked-pr-2.png`](docs/evidence/blocked-pr-2.png) |
| Red CI run on that PR | https://github.com/minhthang2k5/leetkob/actions/runs/43013155512 (`test` failed on CT-08 and CT-09) |
| Commit that turned it green | https://github.com/minhthang2k5/leetkob/commit/546c0e9e85232d18fab6354acf4fa0443ab5d97b |
| Green CI run on that PR | https://github.com/minhthang2k5/leetkob/actions/runs/43013602274 |
| Deliberate contract break | Commit https://github.com/minhthang2k5/leetkob/commit/2bea594e851f05c27bb76f9dc92da46a557194a9 (PR #2, same as above) |
| CI run for the `pa2` tag | https://github.com/minhthang2k5/leetkob/actions?query=branch%3Apa2 |

## What the evidence shows

- **The gate is on `main`.** Ruleset `Protect-main` (created and activated 2026-11-11 about 18:26–18:29, UTC+7) requires a pull request, 1 approval and the four checks `lint`, `format-check`, `typecheck`, `test`; force-push and deletion are blocked and the bypass list is empty. Since it was activated the only change to `main` is the merge of PR #1, approved by another team member (`vhthawng`). Commits before that were pushed directly to `main`, before the protection existed.
- **A red check stopped a merge.** PR #2 deliberately comments out the `REVIEWS_PENDING` guard in `backend/src/services/lab.service.ts`; the contract and the tests are unchanged. CI went red on `test` (CT-08 and CT-09 got `200` instead of `409`) while `lint`, `format-check` and `typecheck` stayed green, and GitHub showed "Merging is blocked". The PR had also no approval yet, so both conditions blocked it; the red `test` check is marked Required in the screenshot.
- **The fix is a real fix.** Commit `546c0e9` restores the guard only. No test and no contract text changed between the break and the fix, and all five checks went green.
- **PR #2 was closed without merging.** The breaking commit is not in `main`; the PR, the runs and the commits stay available as evidence.

## The four checks (same command locally and in CI)

Run from `backend/`; `.github/workflows/ci.yml` runs exactly these, one job each:

```bash
npm run lint
npm run format:check
npm run typecheck
npm test            # needs PostgreSQL: docker compose up -d, then once: npm run db:test:setup
```

Setup from a fresh clone is in [`README.md`](README.md) and [`backend/README.md`](backend/README.md).

## Where the rest of the rubric lives

| Criterion | File |
|---|---|
| Rules file | [`AGENTS.md`](AGENTS.md) (four sections, three permission tiers, rules traced to commits) |
| Permissions and secrets | `AGENTS.md`, `backend/.env.example` (names only), `.gitignore`; no model API key exists in PA#2 |
| One command per check | section above, `backend/package.json` |
| CI that blocks a merge | this file, `.github/workflows/ci.yml`, `docs/evidence/` |
| Contract | [`docs/contract/publish.md`](docs/contract/publish.md), test list in [`docs/contract/publish-test-cases.md`](docs/contract/publish-test-cases.md) |
| Contract tests | `backend/tests/contract/publish.contract.spec.ts` (20 tests) |
| AI log | [`AI-LOG.md`](AI-LOG.md) |
| Self-assessment | `SELF_ASSESSMENT_REPORT.md` |

## Known gaps and honest notes

- The rule "an admin may publish any lab" is a decision of the team lead; the product owners' FAQ has no entry for it. The contract says so in section 6.
- There is no model API key and no spending cap yet: PA#2 calls no model.
- The first CI run on PR #1 failed the SonarCloud quality gate (npm install scripts, rules S6505 and S8543). `ci.yml` was fixed in commit `5172be0` and the PR went green before it was merged.
