# API the frontend calls (draft for PA#3)

Status: **draft from the frontend side**. The backend owner (N2) turns the parts it agrees
with into `docs/contract/*.md`; if the contract and this file disagree, the contract wins
and this file and `src/api/types.ts` are updated to match.

All paths are under `/v1`, JSON UTF-8, `Authorization: Bearer <token>` except login.
Errors are RFC 9457 problem details, as in `docs/contract/publish.md` section 2. The UI
branches on `code`, never on `title` / `detail`.

Every permission check happens on the server. The UI only hides what the server would
refuse anyway; a hidden button is never the protection.

## Auth

| Method | Path | Body | 200 response |
|---|---|---|---|
| POST | `/v1/auth/login` | `{ "username", "password" }` | `{ "token", "user": User }` |
| GET | `/v1/me` | – | `{ "user": User, "classes": ClassSummary[] }` |

`User = { id, name, username, role: "ADMIN" | "TA" | "STUDENT" }`
`ClassSummary = { id, code, name }` — for a TA the classes they are assigned to, for a
student the classes they are enrolled in, for an admin every class.

## Labs

| Method | Path | Who | Response |
|---|---|---|---|
| GET | `/v1/classes/{classId}/labs` | TA of the class, admin, student of the class | `LabSummary[]` |
| POST | `/v1/classes/{classId}/labs` | TA of the class, admin | `201 Lab` |
| GET | `/v1/labs/{labId}` | as above | `Lab` (students get `tests: []`, hidden tests stay hidden) |
| POST | `/v1/labs/{labId}/publish` | existing PA#2 endpoint | `LabPublishReceipt` |

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

`LabSummary = { id, classId, title, status: "DRAFT" | "PUBLISHED", publishedAt, createdAt }`
`Lab = LabSummary & { statement, tests: TestCase[], constraints: Constraint[] }`
`Constraint = { id, code, text, deduction, kind: "BAN_LIST" | "SEMANTIC" }` — `kind` is
decided by the server.

A TA of another class gets `403 FORBIDDEN` on every lab route (PA#2 contract).

## Submissions

| Method | Path | Who | Response |
|---|---|---|---|
| POST | `/v1/labs/{labId}/submissions` | student of the class | `202 Submission` with `status: "QUEUED"` |
| GET | `/v1/labs/{labId}/submissions` | student: own only; TA/admin: all | `Submission[]` |
| GET | `/v1/submissions/{submissionId}` | owner, TA of the class, admin | `Submission` |

```jsonc
Submission = {
  "id", "labId", "studentName" /* TA/admin only */, "createdAt", "judgedAt",
  "status": "QUEUED" | "RUNNING" | "JUDGED" | "FAILED",
  "result": null | "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT" | "MEMORY_LIMIT"
          | "RUNTIME_ERROR" | "COMPILE_ERROR" | "OUTPUT_LIMIT",
  "testsPassed": 3, "testsTotal": 5,
  "compileOutput": "first 4 KB of compiler output, or null"
}
```

A student's `Submission` never contains constraint verdicts or deductions before the lab
is published (product owners' FAQ — cite the entry here once it exists).

## Review queue (TA / admin)

| Method | Path | Response |
|---|---|---|
| GET | `/v1/labs/{labId}/review-queue` | `ReviewQueue` |
| POST | `/v1/verdicts/{verdictId}/review` | `Verdict` (after the review) |

```jsonc
ReviewQueue = {
  "labId", "labStatus", "pendingCount",
  "items": [{
    "submission": Submission,
    "code": "the code as submitted (with comments, for the TA)",
    "verdicts": [Verdict]
  }]
}
Verdict = {
  "id", "constraintId", "constraintCode", "constraintText", "deduction",
  "verdict": "PASS" | "VIOLATION" | "UNSURE",
  "source": "HARD_RULE" | "MODEL" | "GUARDRAIL",
  "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }],
  "reason": "short text from the hard rule or the guardrail, or null",
  "requiresReview": true,   // violation, unsure, or sampled pass
  "isSampled": false,
  "isReviewed": false,
  "decision": null | "CONFIRMED" | "OVERRIDDEN_PASS" | "OVERRIDDEN_VIOLATION",
  "reviewNote": null
}

// POST /v1/verdicts/{verdictId}/review
{ "decision": "CONFIRMED" | "OVERRIDDEN_PASS" | "OVERRIDDEN_VIOLATION", "note": "optional" }
```

`POST /v1/labs/{labId}/publish` keeps refusing with `409 REVIEWS_PENDING` while
`pendingCount > 0`.
