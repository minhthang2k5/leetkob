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
