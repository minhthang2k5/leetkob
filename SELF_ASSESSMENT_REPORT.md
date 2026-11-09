# Self-Assessment Report (SELF_ASSESSMENT_REPORT.md)

**Course**: CSC13114 · Class 2609-AWAD-23/3  
**Milestone**: PA#2 — Harness and Quality Gate  
**Team**: LeeTKOB  
**Repository**: [https://github.com/minhthang2k5/leetkob](https://github.com/minhthang2k5/leetkob)

---

## Rubric Breakdown & Self-Score

| # | Criterion | Max Score | Self Score | Evidence & Justification |
|:---:|---|:---:|:---:|---|
| **1** | **Rules file (`AGENTS.md`)** | 15 | 15 | Contains 4 standard sections (`stack`, `commands`, `conventions`, `never`). Connects at least 2 rules to real project incidents (UUID information leakage oracle prevention, and non-interactive `vitest run` CI hang prevention). Documented in `AGENTS.md`. |
| **2** | **Permissions & Secrets** | 10 | 10 | 3 explicit AI permission levels defined in team plan. Zero secrets in git history. Database credentials templated in `backend/.env.example`. Test database isolated from dev database. |
| **3** | **One command per check** | 10 | 10 | Deterministic, non-interactive scripts: `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm test` implemented in `backend/package.json`. |
| **4** | **CI blocks merge** | 20 | 20 | GitHub Actions `.github/workflows/ci.yml` runs PostgreSQL 16 service container. Branch protection requires status check and 1 approving review. Red PR blocked; green PR merged. |
| **5** | **Contract of one LeeTKOB endpoint** | 25 | 25 | Complete specification at `docs/contract/publish.md` for `POST /v1/labs/:labId/publish`. Enforces RFC 9457 Problem Details (`application/problem+json`), canonical UUID v4 validation, RBAC ownership, and state-based idempotency (`Idempotent-Replayed: true`). |
| **6** | **Contract tests actually catch breaks** | 15 | 15 | Comprehensive Vitest + Supertest suite with 14 test cases (`CT-01` through `CT-14`) in `backend/tests/contract/publish.contract.spec.ts`. Deliberate contract break caught in CI (red -> green fix). |
| **7** | **AI-LOG.md** | 5 | 5 | Transparent, auditable log in `AI-LOG.md` recording AI usage, tools used, tasks requested, and concrete `Kept`, `Changed`, and `Rejected` architectural decisions across team members. |
| | **TOTAL** | **100** | **100** | Full compliance across all 7 criteria. |

---

## Incomplete or Known Limitations
- The current milestone (PA#2) establishes the harness, quality gate, and the `publish` endpoint contract.
- C++ code execution sandboxing, asynchronous message queue (Redis/BullMQ), and LLM constraint evaluation are scheduled for PA#3 per course brief.

---

## Submission ZIP Naming Verification
- Target ZIP format: `<StudentID1>-<StudentID2>-<StudentID3>_100.zip`
- Includes `.git` directory and all required documentation files.
