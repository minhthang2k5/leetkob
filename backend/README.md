# LeeTKOB Backend Service (PA#2)

Backend service for LeeTKOB — C++ Lab Grading and Constraint Verification Platform.  
Built for CSC13114 (PA#2: Harness and Quality Gate) implementing `POST /v1/labs/:labId/publish`.

---

## Tech Stack
- Runtime: Node.js v20+ LTS / TypeScript 5.6 (strict mode)
- Framework: Express.js 4.x
- Database: PostgreSQL 16
- ORM & Migrations: Prisma ORM 5.x
- Testing Engine: Vitest 2.x + Supertest 7.x
- Code Quality: ESLint 8.x + Prettier 3.x

---

## Quickstart Guide (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
`.env.example` lists every variable and holds no values. Create your local `.env` (it fills in the local development defaults and never overwrites an existing `.env`):
```bash
npm run init:env
```

### 3. Start PostgreSQL using Docker Compose
```bash
docker compose up -d
```
Verify the container is healthy:
```bash
docker compose ps
```

### 4. Run Prisma Schema Push & Seed Data
```bash
npm run db:migrate         # applies prisma/migrations to the dev database (leetkob_dev)
npm run db:test:setup     # applies them to the isolated test database (leetkob_test)
```

### 5. Launch the Development Server
```bash
npm run dev
```
The server will listen at `http://localhost:3000`. Test the health check endpoint:
```bash
curl http://localhost:3000/health
```

---

## Quality Gate Verification Commands

Per PA#2 project conventions, each check is run via a single, non-interactive command:

```bash
# 1. Lint TypeScript source and test files
npm run lint

# 2. Verify code formatting style
npm run format:check

# 3. Static type check with TypeScript compiler
npm run typecheck

# 4. Execute all contract tests (needs `npm run db:test:setup` once; uses leetkob_test only)
npm test
```

---

## Contract Test Coverage Matrix

All tests strictly map to `docs/contract/publish-test-cases.md`:

| Test ID | Scenario | Expected Status | Problem / Replay Header |
|:---:|---|:---:|---|
| **CT-01** | TA of assigned class publishes lab with 0 pending reviews | `200` | Lab updated to `PUBLISHED`, timestamp stored |
| **CT-02** | System Admin publishes lab with 0 pending reviews | `200` | Lab updated to `PUBLISHED` |
| **CT-03** | Missing `Authorization` header | `401` | RFC 9457 `.../unauthorized` |
| **CT-04** | Malformed or invalid Bearer token | `401` | RFC 9457 `.../unauthorized` |
| **CT-05** | Student role attempts to publish lab | `403` | RFC 9457 `.../forbidden` (rejected before DB query) |
| **CT-06** | TA of Class B attempts to publish lab of Class A | `403` | RFC 9457 `.../forbidden` (tenancy ownership rule) |
| **CT-07** | Valid UUID v4 but lab does not exist in DB | `404` | RFC 9457 `.../not-found` |
| **CT-08** | Lab has unreviewed `VIOLATION` or `UNSURE` items | `409` | RFC 9457 `.../reviews-pending` |
| **CT-09** | Lab has unreviewed 10% sampled `PASS` items | `409` | RFC 9457 `.../reviews-pending` |
| **CT-10** | `labId` is not a canonical UUID v4 string | `400` | RFC 9457 `.../invalid-request` (`errors` array) |
| **CT-10b** | `labId` is a UUID v1, not v4 | `400` | RFC 9457 `.../invalid-request` |
| **CT-11** | Idempotent replay on already `PUBLISHED` lab | `200` | Header `Idempotent-Replayed: true`, timestamp preserved |
| **CT-12** | Concurrency: Two simultaneous publish requests | `200` | Both return identical timestamp, 1 atomic transition |
| **CT-13** | Security check precedes idempotency on published lab | `403` | Unauthorized callers cannot probe published labs |
| **CT-13b** | TA of another class calls an already published lab | `403` | RFC 9457 `.../forbidden`, no `publishedAt` leaked |
| **CT-14** | Client sends unexpected extra JSON body fields | `200` | Extra body fields ignored safely |
| **CT-15** | Database failure while publishing | `500` | RFC 9457 `.../internal`, no internals in `detail` |
| **CT-16** | Malformed JSON body | `200` | Body is never read, so it is ignored |
| **CT-17** | Unknown `/v1` path or wrong method | `404` | RFC 9457 `.../route-not-found` |

---

## Documentation Links
- API Contract Specification: [`../docs/contract/publish.md`](../docs/contract/publish.md)
- Detailed Test Checklist: [`../docs/contract/publish-test-cases.md`](../docs/contract/publish-test-cases.md)
- Postman Collection: [`./postman/LeeTKOB_PA2_Publish.postman_collection.json`](./postman/LeeTKOB_PA2_Publish.postman_collection.json)
- Handover Document & Break Recipe: [`./HANDOVER.md`](./HANDOVER.md)
