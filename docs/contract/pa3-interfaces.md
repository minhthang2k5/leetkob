# LeeTKOB PA#3 — Interfaces and API Contract, Version 1

CSC13114 · PA#3 LeeTKOB · proposed 23 Nov 2026

This file is the specification for PA#3. It has two parts:

- **Part A** — the TypeScript interfaces between the packages (`sandbox`, `checker`, `worker`, `backend`).
  They live in `shared/` so every package imports the same types.
- **Part B** — the new HTTP endpoints. `docs/contract/publish.md` stays the specification for
  `POST /v1/labs/{labId}/publish`; nothing here changes it.

If the code and this file disagree, the code is wrong. To change this file, open a PR that changes only
this file and says why; it needs one approval like any other PR.

Owners: **N0** = backend, API, DB, CI (Minh Thắng) · **N1** = sandbox, worker, deploy · **N2** = checker, model, eval.

---

## Part A — Interfaces between packages

### A.0 Conventions

- Enum values are UPPERCASE (`PASS`, `VIOLATION`, `UNSURE`), the same in the DB, the API and the UI.
  Only the checker CLI writes lowercase verdicts in `predictions.jsonl`, because `eval.mjs` expects them (brief, section 6).
- Line numbers always refer to the **code as submitted**; line 1 is the first line of the file.
- No interface below carries a student name, student id, email or any secret.

### A.1 `judge()` — sandbox (owner N1)

```ts
export interface Limits {
  cpuSeconds: number;   // default 2
  wallSeconds: number;  // default 5; past it the whole container is killed
  memoryMb: number;     // default 256; swap = memory (no extra swap)
  pids: number;         // default 64
  outputBytes: number;  // default 64 * 1024
}

export interface TestCase { input: string; expectedOutput: string }

export type JudgeResult =
  | 'ACCEPTED' | 'WRONG_ANSWER' | 'TIME_LIMIT' | 'MEMORY_LIMIT'
  | 'RUNTIME_ERROR' | 'COMPILE_ERROR' | 'OUTPUT_LIMIT';

export interface JudgeOutcome {
  result: JudgeResult;
  testsPassed: number;
  testsTotal: number;
  compileOutput: string | null; // at most 4 KB, only for COMPILE_ERROR
  durationMs: number;
}

export function judge(code: string, tests: TestCase[], limits?: Partial<Limits>): Promise<JudgeOutcome>;
```

Rules:
1. A fault of the submission (wrong output, timeout, memory, crash, compile error) **returns** a `JudgeOutcome`; it never throws.
2. `judge()` throws only when the infrastructure fails (for example the Docker daemon is down). The worker then retries.
3. Stops at the first failing test. Output comparison ignores trailing spaces on each line and trailing empty lines.
4. Compilation runs inside the sandbox too.
5. `judge()` never receives an API key or any server environment variable.

### A.2 `checkSubmission()` — checker (owner N2)

```ts
export type VerdictValue = 'PASS' | 'VIOLATION' | 'UNSURE';
export type VerdictSource = 'HARD_RULE' | 'MODEL' | 'GUARDRAIL';

export interface CheckConstraint { id: string; code: string; text: string } // code = "C1"

export interface CheckInput {
  statement: string;
  constraints: CheckConstraint[];
  code: string; // the code as submitted; the checker removes comments and keeps line numbers
}

export interface CheckVerdict {
  constraintId: string;
  constraintCode: string;
  verdict: VerdictValue;
  source: VerdictSource;
  evidence: { line: number; text: string }[];
  reason: string | null; // e.g. "timeout", "schema invalid", "evidence line 12 does not match"
}

export interface CheckOptions {
  modelOff: boolean;     // MODEL_OFF=1: hard rules only, semantic constraints become UNSURE, no network
  judge?: SemanticJudge; // required when modelOff is false
  timeoutMs?: number;    // default 30_000 per model call
}

export interface CheckResult {
  verdicts: CheckVerdict[]; // exactly one per constraint, in input order
  calls: ModelCallLog[];    // empty when no model call was made; the worker stores them in ModelCall
}

export function checkSubmission(input: CheckInput, opts: CheckOptions): Promise<CheckResult>;

export type ConstraintKind = 'BAN_LIST' | 'SEMANTIC';
export function classifyConstraint(text: string): ConstraintKind; // pure; the API uses it for Constraint.kind
```

Rules:
1. No field about deductions. Deductions belong to the TA and live in the DB.
2. The checker never touches the DB and never receives an identity. The worker passes only statement, constraints and code.
3. A constraint decided by a hard rule is **not** sent to the model (the call log shows it).
4. Guardrails live in the checker, not in the model adapter: schema check, every evidence line must match the code at that line,
   timeout. If any check fails, the verdict becomes `UNSURE` with `source: 'GUARDRAIL'`.
5. The CLI (`checker <dataset_dir> --out predictions.jsonl`) calls this same function, so the web flow and the graded command agree.

### A.3 `SemanticJudge` — model adapter inside the checker (owner N2)

```ts
export interface SemanticRequest {
  statement: string;
  constraints: CheckConstraint[]; // only semantic constraints a hard rule did not decide
  code: string;                   // comments removed, line numbers kept
}

export interface ModelCallLog {
  provider: string;               // "anthropic"
  model: string;                  // chosen by N2 before the real dev-set run
  requestId: string | null;       // the provider's request id (required on the real dev-set run)
  inputTokens: number;
  outputTokens: number;
  ms: number;
  costUsd: number;
  status: 'OK' | 'TIMEOUT' | 'API_ERROR';
  prompt: string;                 // the anonymised prompt, to show no comments or identity were sent
}

export interface SemanticJudge {
  judge(req: SemanticRequest, opts: { timeoutMs: number }): Promise<{ raw: unknown; call: ModelCallLog }>;
}
```

Rules:
1. The adapter returns **`raw: unknown`** (not trusted). The checker validates it.
2. **One model call per submission**, with every remaining semantic constraint in the same request.
3. A `FakeJudge` with four modes ships with the checker: `valid`, `invalid-json`, `slow` (exceeds the timeout),
   `wrong-evidence`. Unit and contract tests use it; they never open the network or need a key.
4. **Cost cap per lab** (brief, section 3): before calling the model the checker is told the lab's spend so far;
   past the cap it does not call the model and the semantic constraints become `UNSURE` with
   `reason: "lab cost cap reached"`. The cap amount is N2's decision and is recorded in `README.md`.

### A.4 Queue — `submissions` table (N0 creates jobs, N1 consumes them)

```ts
export interface JudgeJob { submissionId: string } // the only payload
```

Rules:
1. The queue is the `submissions` table in Postgres. The worker claims a job with `SELECT ... FOR UPDATE SKIP LOCKED`. No Redis.
2. The job carries only `submissionId`. The worker reads code, tests and constraints from the DB. No code or secret in the job.
3. Status: `QUEUED → RUNNING → JUDGED`, or `FAILED` after 3 attempts. Columns `attempts` and `lockedAt`.
   A row `RUNNING` for more than 2 minutes is treated as a dead worker and goes back to `QUEUED`.
4. The submit endpoint only inserts a `QUEUED` row and returns `202`. **No judging inside the request handler.**
5. Judged exactly once: `ConstraintVerdict` has `@@unique([submissionId, constraintId])` and the worker upserts.
6. The worker samples 10% of `PASS` verdicts as `isSampled`, deterministically from a seed, so a re-run gives the same sample.
7. The worker calls `checkSubmission()` only when `judge()` returned `ACCEPTED`.

---

## Part B — HTTP API

### B.1 Conventions

Same as `docs/contract/publish.md` section 1: everything under `/v1`, JSON UTF-8, timestamps ISO 8601 UTC with
milliseconds, ids are UUID v4, `Authorization: Bearer <token>` on every route except login, unknown response fields
are ignored by clients, unknown body fields are ignored by the server.

Every permission check happens on the server. The UI only hides what the server would refuse anyway.

### B.2 Errors

RFC 9457 problem details exactly as in `publish.md` section 2. Every slug there keeps its meaning. New slugs:

| Slug | HTTP Status | Code | Title | Trigger Condition |
|---|---|---|---|---|
| `invalid-credentials` | 401 | `INVALID_CREDENTIALS` | Invalid credentials | Login with an unknown username or a wrong password. The same answer for both, so it does not reveal which usernames exist. |
| `class-not-found` | 404 | `CLASS_NOT_FOUND` | Class not found | `classId` is a valid UUID but no class exists. |
| `submission-not-found` | 404 | `SUBMISSION_NOT_FOUND` | Submission not found | `submissionId` is a valid UUID but no submission exists, or it belongs to another student. |
| `verdict-not-found` | 404 | `VERDICT_NOT_FOUND` | Verdict not found | `verdictId` is a valid UUID but no verdict exists. |
| `lab-published` | 409 | `LAB_PUBLISHED` | Lab already published | Submitting to, or reviewing a verdict of, a lab that is already published. |
| `rate-limited` | 429 | `RATE_LIMITED` | Too many submissions | A student exceeded the submission limit (B.5). The response has a `Retry-After` header in seconds. |

`invalid-request` (400) also covers a body that fails validation; `errors[]` lists each `{ pointer, detail }`.

### B.3 Auth

| Method | Path | Body | 200 response |
|---|---|---|---|
| POST | `/v1/auth/login` | `{ "username", "password" }` | `{ "token", "user": User }` |
| GET | `/v1/me` | – | `{ "user": User, "classes": ClassSummary[] }` |

- `User = { id, name, username, role: "ADMIN" | "TA" | "STUDENT" }`
- `ClassSummary = { id, code, name }`: for a TA the classes they are assigned to, for a student the classes they are
  enrolled in, for an admin every class.
- Passwords are hashed with `scrypt` from `node:crypto` (no new dependency) and a per-user salt. The token is an opaque
  random string (32 random bytes, base64url); the DB stores only its SHA-256 hash, so a copy of the DB holds no usable
  token. It is never a password and never logged.
- A token expires **12 hours** after login. After that, every route answers `401 unauthorized`, as for an unknown
  token; the client logs in again. There is no logout endpoint in v1.
- Login body validation: `username` and `password` are required strings, at most 100 and 200 characters. A body that is
  missing, not JSON, or not an object is `400 invalid-request` with `errors[]` pointers (`/username`, `/password`).
- The test accounts of the deployment (1 admin, 2 TAs of two classes, 2 students of the first TA's class) are created
  by `npm run db:seed:accounts -w backend`, which reads their passwords from environment variables. No password is in git.
- PA#2 fixture tokens (`users.token`) still authenticate in the test database only; deployed accounts have none.

### B.4 Labs

| Method | Path | Who | Response |
|---|---|---|---|
| GET | `/v1/classes/{classId}/labs` | TA of the class, admin, student of the class | `LabSummary[]` |
| POST | `/v1/classes/{classId}/labs` | TA of the class, admin | `201 Lab` |
| GET | `/v1/labs/{labId}` | TA of the class, admin, student of the class | `Lab` |
| POST | `/v1/labs/{labId}/publish` | unchanged, see `publish.md` | `LabPublishReceipt` |

```jsonc
// POST /v1/classes/{classId}/labs
{
  "title": "Sorting — merge sort",
  "statement": "markdown text",
  "tests": [{ "input": "3\n3 1 2\n", "expectedOutput": "1 2 3\n" }],
  "constraints": [
    { "code": "C1", "text": "Do not use `std::sort` or `std::stable_sort`.", "deduction": 3 },
    { "code": "C2", "text": "Implement merge sort recursively.", "deduction": 5 }
  ]
}
```

- `LabSummary = { id, classId, title, status: "DRAFT" | "PUBLISHED", publishedAt, createdAt }`
- `Lab = LabSummary & { statement, tests: TestCase[], constraints: Constraint[] }`
- `Constraint = { id, code, text, deduction, kind: "BAN_LIST" | "SEMANTIC" }`. `kind` is set by the server with
  `classifyConstraint()` (A.2); a client value is ignored.
- A student gets `tests: []` and constraints **without** `deduction` (hidden tests stay hidden).
- A TA of another class gets `403 FORBIDDEN` on every lab route, as in `publish.md`.
- Validation: at least 1 test and at least 1 constraint, constraint codes unique in the lab, `deduction` an integer ≥ 0.
  Upper limits, each a `400 invalid-request` with a pointer such as `/tests/3/input`:

  | Field | Limit |
  |---|---|
  | `title` | 1–200 characters |
  | `statement` | 1–50 000 characters |
  | `tests` | 1–50 items; `input` and `expectedOutput` strings of at most 64 KB (UTF-8) each, may be empty |
  | `constraints` | 1–20 items; `code` 1–16 characters, `text` 1–2 000 characters, `deduction` integer 0–100 |
  | whole body | at most 2 MB |

- Unknown fields are ignored. The lab is created as `DRAFT`; tests keep the order they were sent in.
- Every lab route answers in this order: `400` (id not a UUID v4), `404` (no such class or lab), `403` (not allowed).

### B.5 Submissions

| Method | Path | Who | Response |
|---|---|---|---|
| POST | `/v1/labs/{labId}/submissions` | student of the class | `202 Submission` with `status: "QUEUED"` |
| GET | `/v1/labs/{labId}/submissions` | student: own only; TA of the class, admin: all | `Submission[]`, newest first |
| GET | `/v1/submissions/{submissionId}` | owner, TA of the class, admin | `Submission` |

```jsonc
// POST /v1/labs/{labId}/submissions
{ "code": "#include <iostream>\n..." }   // UTF-8, at most 64 KB

Submission = {
  "id", "labId", "studentName" /* TA and admin only */, "createdAt", "judgedAt",
  "status": "QUEUED" | "RUNNING" | "JUDGED" | "FAILED",
  "result": null | "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT" | "MEMORY_LIMIT"
          | "RUNTIME_ERROR" | "COMPILE_ERROR" | "OUTPUT_LIMIT",
  "testsPassed": 3, "testsTotal": 5,
  "compileOutput": "first 4 KB of compiler output, or null"
}
```

- The handler stores the row as `QUEUED` and returns. Judging happens only in the worker (A.4).
- Only a **student enrolled in the lab's class** may submit; a TA or an admin gets `403 FORBIDDEN`. A published lab
  takes no more submissions: `409 LAB_PUBLISHED`. `code` must not be blank and is at most 64 KB (UTF-8); the body at most 256 KB.
- **Submission limit:** a student may submit at most **5 times per 10 minutes per lab**; above it `429 RATE_LIMITED`.
  The window slides: `Retry-After` is the number of seconds until the oldest of those 5 leaves the window. Two
  requests at the same moment cannot both pass the limit. The numbers are N0's decision and may change in a PR to this file.
- Before the lab is published, a student's `Submission` **never** contains constraint verdicts or deductions.
- A student asking for another student's submission gets `404 SUBMISSION_NOT_FOUND` (does not reveal that it exists).

### B.6 Review queue (TA of the class, admin)

| Method | Path | Response |
|---|---|---|
| GET | `/v1/labs/{labId}/review-queue` | `ReviewQueue` |
| POST | `/v1/verdicts/{verdictId}/review` | `Verdict` after the review |

```jsonc
ReviewQueue = {
  "labId", "labStatus", "pendingCount",
  "items": [{
    "submission": Submission,
    "code": "the code as submitted, with comments, for the TA",
    "verdicts": [Verdict]
  }]
}

Verdict = {
  "id", "constraintId", "constraintCode", "constraintText", "deduction",
  "verdict": "PASS" | "VIOLATION" | "UNSURE",
  "source": "HARD_RULE" | "MODEL" | "GUARDRAIL",
  "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }],
  "reason": "short text from the hard rule or the guardrail, or null",
  "requiresReview": true,   // VIOLATION, UNSURE, or a sampled PASS
  "isSampled": false,
  "isReviewed": false,
  "decision": null | "CONFIRMED" | "OVERRIDDEN_PASS" | "OVERRIDDEN_VIOLATION",
  "reviewNote": null
}

// POST /v1/verdicts/{verdictId}/review
{ "decision": "CONFIRMED" | "OVERRIDDEN_PASS" | "OVERRIDDEN_VIOLATION", "note": "optional, at most 1000 chars" }
```

- A review may be changed again until the lab is published; after that `409 LAB_PUBLISHED`.
- `pendingCount` = verdicts with `requiresReview: true` and `isReviewed: false`. `POST /v1/labs/{labId}/publish`
  keeps refusing with `409 REVIEWS_PENDING` while it is above 0, as in `publish.md`.
- The automatic verdict is kept; the TA's decision is stored next to it, so the eval can compare model and human.

---

## Changelog

| Date | Version | Change |
|---|---|---|
| 2026-11-23 | v1 | First version: package interfaces (judge, checkSubmission, SemanticJudge, queue) and the PA#3 endpoints. `publish.md` unchanged. |
| 2026-11-23 | v1 (clarification) | B.3: token format, stored as a hash, 12-hour expiry, login body limits, how the test accounts are created, PA#2 fixture tokens. No path, field or status changes. |
| 2026-11-23 | v1 (clarification) | B.4/B.5: upper size limits, order of 400/404/403, who may submit, sliding submission window and `Retry-After`. No path, field or status changes. |

## Decisions and sources

| Decision | Status | Source |
|---|---|---|
| Hard rules first, the model only for constraints they cannot decide; verdicts PASS / VIOLATION / UNSURE with evidence lines. | From the brief. | Class project brief, sections 2–3. |
| Every VIOLATION, every UNSURE and a random 10% of PASS go to a TA; marks are published only after review. | From the brief. | Class project brief, section 3 (Human gate). |
| Judging runs in a separate worker, never in the request handler; each submission is judged exactly once. | From the rubric. | PA#3 rubric, criterion 4. |
| Queue = Postgres table with `SKIP LOCKED`, payload `{ submissionId }`. | Team decision, 23/11 meeting. | `CHOT_INTERFACES.md` (team notes). |
| Provider Anthropic; model, effort and cost caps chosen by N2, recorded in `README.md`. | Team decision, 23/11 meeting. | Team notes. |
| Hard rules parse C++ with `web-tree-sitter` (new dependency, agreed by the team). | Team decision, 23/11 meeting. | Team notes. |
| Students see judge status and result only, never verdicts or deductions, before publish. | **Team default**; cite the product owners' FAQ entry here once there is one. | Team notes. |
| Login with username + password (`scrypt`), opaque session token. | Team default. | Team notes. |
| Submission limit 5 per 10 minutes per lab. | Team default (N0). | Team notes. |
