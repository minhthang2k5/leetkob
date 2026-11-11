# LeeTKOB — Automated C++ Lab Grading with AI Constraint Verification

[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.21-indigo.svg)](https://www.prisma.io/)
[![RFC 9457](https://img.shields.io/badge/RFC%209457-Problem%20Details-orange.svg)](https://datatracker.ietf.org/doc/html/rfc9457)

Course: CSC13114 · Class 2609-AWAD-23/3  
Milestone: PA#2 — Harness and Quality Gate  
Authors: Team LeeTKOB — Tran Vu Quang (23120346), Trinh Ho Minh Thang (23120354), Vo Huu Thang (23120355)

---

## 1. About the Project

LeeTKOB is an automated grading and semantic constraint review platform for introductory C++ programming labs. It eliminates wrongful deductions by combining deterministic AST-level hard rules with an LLM judge, protected by a strict Human Gate:

- Accepted C++ submissions undergo automated constraint checks returning pass, violation, or unsure.
- The Human Gate: Marks are never published automatically. 100% of violation verdicts, 100% of unsure verdicts, and a random 10% audit sample of pass verdicts are queued for Teaching Assistant (TA) review.
- Publication Endpoint: Marks can only be released when an authorized TA verifies all required reviews and triggers `POST /v1/labs/{labId}/publish`.

---

## 2. Repository Architecture (N2 Package 2)

All application source code, tests, and database management are encapsulated inside the `backend/` directory:

```text
leetkob/
├── docs/
│   └── contract/
│       ├── publish.md           # API Ground Truth Contract (RFC 9457, idempotency, RBAC)
│       └── publish-test-cases.md# Detailed Contract Test Specifications (CT-01 -> CT-15)
├── backend/                     # Backend application workspace (N2)
│   ├── compose.yaml             # Docker Compose service for PostgreSQL 16
│   ├── .env.example             # Variable names only, no values (npm run init:env fills .env)
│   ├── .eslintrc.json           # ESLint TypeScript configuration
│   ├── .prettierrc              # Prettier formatting configuration
│   ├── package.json             # Scripts & dependencies
│   ├── tsconfig.json            # Strict TypeScript compiler options
│   ├── vitest.config.ts         # Vitest test runner configuration
│   ├── README.md                # Dedicated backend documentation
│   ├── postman/                 # Postman collection + local environment
│   ├── docker/initdb/           # Creates the isolated leetkob_test database
│   ├── scripts/                 # db-test-setup.js (migrations for the test DB)
│   ├── prisma/
│   │   ├── schema.prisma        # Models: User, Class, ClassTA, Lab, SubmissionReview
│   │   └── seed.ts              # Canonical test fixtures for the contract tests
│   ├── src/                     # Express application source code
│   │   ├── app.ts               # In-memory Express instance (imported by Supertest)
│   │   ├── server.ts            # Standalone HTTP listener
│   │   ├── types/               # RFC 9457 & Auth TypeScript interfaces
│   │   ├── utils/               # Prisma singleton & RFC 9457 problem creators
│   │   ├── middlewares/         # Bearer auth, UUID v4 validation, and 500 error handler
│   │   ├── routes/              # Modular routing mounted under /v1
│   │   ├── controllers/         # Request handling & HTTP response mapping
│   │   └── services/            # Core business invariants & atomic transactions
│   └── tests/                   # Automated test suite
│       ├── helpers/             # Database resets & mock auth token fixtures
│       └── contract/            # Contract Tests (Vitest + Supertest)
├── AI-LOG.md                    # Auditable AI usage log
├── ROADMAP.md                   # N2 Internal development roadmap
└── README.md                    # Project root documentation
```

---

## 3. The 4 Deterministic Quality Gate Checks

Per project rules and rubric requirements, each quality gate is triggered via a single, non-interactive command inside `backend/`:

| Check | Command | Description |
|---|---|---|
| Linting | `npm run lint` | Runs `eslint src tests --ext .ts` without hanging. |
| Formatting | `npm run format:check` | Verifies style compliance with `prettier --check`. |
| Type Checking | `npm run typecheck` | Validates strict static typing with `tsc --noEmit`. |
| Contract Testing | `npm test` | Executes all contract tests via `vitest run` (exit code 0/1). |

---

## 4. Getting Started (Local Setup)

### Prerequisites
- Node.js v20+ LTS
- Docker & Docker Compose (or managed cloud PostgreSQL)
- Git

### Step 1: Clone the repository
```bash
git clone https://github.com/minhthang2k5/leetkob.git
cd leetkob/backend
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Setup environment variables
`.env.example` lists every variable and holds no values. Create your local `.env` (it fills in the local development defaults and never overwrites an existing `.env`):
```bash
npm run init:env
```

### Step 4: Start PostgreSQL with Docker Compose
```bash
docker compose up -d
```
Verify the container is healthy:
```bash
docker compose ps
```

### Step 5: Run Prisma Migrations and Seed Database
```bash
npm run db:migrate        # applies prisma/migrations to the dev database
npx prisma db seed        # optional: sample data in the dev database
```

### Step 6: Start the Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000`. Test the health check endpoint:
```bash
curl http://localhost:3000/health
```

---

## 5. Running Contract Tests

Run all contract tests (covering Happy path, Admin role, Student 403, Ownership 403, UUID 400, Reviews Pending 409, Idempotency Replay, Concurrency, and Extensibility):

The tests use their own database, `leetkob_test` (from `TEST_DATABASE_URL`), and never touch the dev database. The helper refuses to reset any database whose name does not end in `_test`. With PostgreSQL running (`docker compose up -d`) and `.env` created, prepare the test database once and run the tests:

```bash
cd backend
npm run db:test:setup   # once: applies migrations to leetkob_test
npm test
```

If your Docker volume was created before `leetkob_test` existed, create it once: `docker compose exec postgres psql -U postgres -c "CREATE DATABASE leetkob_test;"`.

Expected result:
```text
Test Files  1 passed (1)
     Tests  20 passed (20)
```

---

## 6. Postman Collection

A complete Postman test suite is provided under `backend/postman/`:
1. Open Postman -> Click Import.
2. Select `backend/postman/LeeTKOB_PA2_Publish.postman_collection.json`.
3. Select `backend/postman/LeeTKOB_Local.postman_environment.json`.
4. Run the collection. All 10 requests include automated test assertions verifying status codes, RFC 9457 problem schemas, and the `Idempotent-Replayed: true` header.

---

## 7. AI and model usage

PA#2 calls no model: the endpoint has no LLM step and the tests never call a real model. No model API key exists in this repository. When a provider is chosen for PA#3, its key will be created with a spending cap, kept out of git (`.env` is ignored) and listed without a value in `.env.example`; this section will then name the model and the cost of one lab.

---

## 8. Handover Reference
- API Contract Specification: Refer to `docs/contract/publish.md`.
- Handover Details & Deliberate Break Recipe for N1: Refer to `backend/HANDOVER.md`.
