# Project Rules for AI Assistants (AGENTS.md)

This rules file establishes project invariants and operational constraints for AI coding agents working on the LeeTKOB codebase.

---

## 1. Stack

- **Runtime & Language**: Node.js (v20+ LTS) with TypeScript (Strict mode enabled).
- **Backend Framework**: Express.js with modular routing mounted under `/v1`.
- **Database & Persistence**: PostgreSQL 16 managed exclusively through Prisma ORM (schema, migrations, seed).
- **Testing Engine**: Vitest for test execution, Supertest for in-memory HTTP contract assertions.
- **Protocol & Serialization**: RFC 9457 Problem Details (`application/problem+json; charset=utf-8`) for 4xx/5xx responses; JSON UTF-8 for 200 OK receipts.
- **CI/CD Platform**: GitHub Actions runner with official PostgreSQL service container.

---

## 2. Commands

Every check is executed via a single, deterministic, non-interactive command:

- **Linting**:  
  `npm run lint` (runs `eslint src tests --ext .ts` without hanging).
- **Format Verification**:  
  `npm run format:check` (runs `prettier --check` on TypeScript files).
- **Type Checking**:  
  `npm run typecheck` (runs `tsc --noEmit` and validates strict typing).
- **Test Suite**:  
  `npm test` (runs `vitest run` once and returns standard exit code `0` on success, `1` on failure).
- **Database Migrations & Seed**:  
  `npx prisma migrate dev` and `npx prisma db seed`.

---

## 3. Conventions

- **Workspace Boundaries**: All application source code, tests, and configuration must reside within the `backend/` directory.
- **Contract Primacy**: The API specification at `docs/contract/publish.md` is the ground truth. Implementation code must conform to the contract, not vice-versa.
- **Zero Information Leakage in RBAC**: Security and role validation (e.g. rejecting students with `403 Forbidden`) must execute **before** database lookups. This prevents unprivileged callers from probing valid lab UUIDs via 404 responses *(Reflected in AI-LOG 2026-11-09 incident review)*.
- **Explicit Idempotency Semantics**: Repeated publication calls on an already `PUBLISHED` lab must safely return `200 OK` with the exact original `publishedAt` timestamp and include the response header `Idempotent-Replayed: true`.
- **Error Uniformity**: No generic `{ "error": "message" }` payloads are permitted. All errors must instantiate standard RFC 9457 Problem Details objects.

---

## 4. Never

- **NEVER commit secrets or real tokens**: Never commit private keys, real session credentials, or `.env` files into Git history. All environment configurations must be represented as placeholders in `.env.example`.
- **NEVER run tests in watch mode in CI**: Interactive or watch flags (`vitest`, `nodemon`) hang CI runners indefinitely. Always use `vitest run` *(Traced to early workflow hang issue)*.
- **NEVER bypass quality gates or branch protection**: Do not push directly to the protected `main` branch or merge PRs with failing checks.
- **NEVER mock or soften contract tests to pass CI**: Do not alter contract test expectations or assertions merely to conceal an implementation defect.
- **NEVER call third-party LLM providers inside automated unit/contract tests**: Tests must remain hermetic, fast, and deterministic without incurring external model inference costs.

