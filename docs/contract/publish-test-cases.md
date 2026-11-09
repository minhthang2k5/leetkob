# LeeTKOB Lab Publish API — Test Cases & Checklist

CSC13114 · PA#2 LeeTKOB · Checklist for `POST /v1/labs/{labId}/publish`

This checklist specifies the exact test cases for the contract in `docs/contract/publish.md`.
The backend engineer (N2) must implement all tests in Vitest + Supertest against these exact assertions.
Each test must verify **HTTP status code**, **response headers**, **response body shape and values**, and **database state integrity**.

---

## 1. Summary Matrix

| ID | Test Promise / Scenario | Caller Role | Initial Lab State | Expected Status | Expected `type` / Header | DB Side Effects? |
|---|---|---|---|:---:|---|:---:|
| **CT-01** | §4.1 Happy path: TA of assigned class publishes lab with zero pending reviews | TA (Assigned) | Ready (`DRAFT`, 0 pending) | `200` | None (no replay header) | Lab status $\rightarrow$ `PUBLISHED`, `publishedAt` set |
| **CT-02** | §4.1 Admin publishes lab with zero pending reviews | Admin | Ready (`DRAFT`, 0 pending) | `200` | None | Lab status $\rightarrow$ `PUBLISHED`, `publishedAt` set |
| **CT-03** | §4.1 Missing `Authorization` header | None | Ready (`DRAFT`, 0 pending) | `401` | `.../unauthorized` | No change |
| **CT-04** | §4.1 Malformed, invalid, or expired Bearer token | Invalid | Ready (`DRAFT`, 0 pending) | `401` | `.../unauthorized` | No change |
| **CT-05** | §4.1 Authenticated student attempts to publish | Student | Ready (`DRAFT`, 0 pending) | `403` | `.../forbidden` | No change |
| **CT-06** | §4.1 TA of Class B attempts to publish lab of Class A (Ownership violation) | TA (Class B) | Lab in Class A (`DRAFT`) | `403` | `.../forbidden` | No change |
| **CT-07** | §4.1 Valid UUID v4 but lab does not exist in database | TA (Assigned) | Non-existent | `404` | `.../not-found` | No change |
| **CT-08** | §4.1 Lab has pending required `violation` or `unsure` reviews | TA (Assigned) | Incomplete (1 `violation` pending) | `409` | `.../reviews-pending` | No change (remains `DRAFT`) |
| **CT-09** | §4.1 Lab has pending required 10% sampled `pass` reviews | TA (Assigned) | Incomplete (1 sampled `pass` pending) | `409` | `.../reviews-pending` | No change (remains `DRAFT`) |
| **CT-10** | §4.1 `labId` parameter is not a valid canonical UUID v4 string | TA (Assigned) | N/A (`"lab-123"`) | `400` | `.../invalid-request` | No change |
| **CT-11** | §4.1 Idempotency: Re-calling publish on already `PUBLISHED` lab | TA (Assigned) | Already `PUBLISHED` | `200` | `Idempotent-Replayed: true` | Original `publishedAt` preserved |
| **CT-12** | §4.1 Concurrency: Two simultaneous publish requests on the same ready lab | TA (Assigned) | Ready (`DRAFT`, 0 pending) | `200` / `200` | Consistent state | Exactly 1 transition, identical timestamp |
| **CT-13** | §4.1 Ownership check precedes Idempotency: Student/unauthorized TA calls already published lab | Student / TA Class B | Already `PUBLISHED` | `403` | `.../forbidden` | Lab remains untouched |
| **CT-14** | §1 Extensibility: Client sends non-empty/unexpected JSON body | TA (Assigned) | Ready (`DRAFT`, 0 pending) | `200` | None | Body ignored; Lab published successfully |

---

## 2. Detailed Test Specifications

### CT-01: Happy Path — TA Publishes Completed Lab
- **Contract Reference**: §4.1 Processing step 7
- **Preconditions**:
  - Class `CLASS_A` exists with assigned TA `ta_user_1`.
  - Lab `lab_1` belongs to `CLASS_A` with status `DRAFT`, `publishedAt = null`.
  - Submissions exist, and all reviews required for `lab_1` have been approved/resolved (`pendingCount = 0`).
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - Header: `Authorization: Bearer <token_for_ta_user_1>`
- **Expected Response**:
  - HTTP Status: `200 OK`
  - Header: `Content-Type: application/json; charset=utf-8`
  - Header `Idempotent-Replayed` must **not** be present.
  - Body:
    ```json
    {
      "labId": "{lab_1.id}",
      "status": "PUBLISHED",
      "publishedAt": "<ISO-8601-UTC-TIMESTAMP>"
    }
    ```
- **Database Post-condition**:
  - Lab `lab_1` in database has `status = "PUBLISHED"`.
  - Lab `lab_1` has `publishedAt` equal to the response timestamp.

---

### CT-02: Admin Publishes Completed Lab
- **Contract Reference**: §4.1 Who may call it & Processing step 7
- **Preconditions**:
  - Admin user `admin_user` exists (role `ADMIN`).
  - Lab `lab_2` belongs to `CLASS_A` (admin is not explicitly a class TA) with status `DRAFT`.
  - All required reviews for `lab_2` are completed.
- **Request**:
  - `POST /v1/labs/{lab_2.id}/publish`
  - Header: `Authorization: Bearer <token_for_admin_user>`
- **Expected Response**:
  - HTTP Status: `200 OK`
  - Body `status`: `"PUBLISHED"`
  - Body `publishedAt`: valid ISO 8601 UTC timestamp.

---

### CT-03: Missing Authorization Header
- **Contract Reference**: §4.1 Processing step 1
- **Preconditions**: Lab `lab_1` exists.
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - No `Authorization` header sent.
- **Expected Response**:
  - HTTP Status: `401 Unauthorized`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body:
    - `type`: `"https://leetkob.example/problems/unauthorized"`
    - `title`: `"Unauthorized"`
    - `status`: `401`
    - `code`: `"UNAUTHORIZED"`
    - `instance`: `"/v1/labs/{lab_1.id}/publish"`
- **Database Post-condition**: Lab state remains unchanged.

---

### CT-04: Malformed or Invalid Token
- **Contract Reference**: §4.1 Processing step 1
- **Preconditions**: Lab `lab_1` exists.
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - Header: `Authorization: Bearer invalid-or-expired-token`
- **Expected Response**:
  - HTTP Status: `401 Unauthorized`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body `code`: `"UNAUTHORIZED"`
  - Body `type`: `"https://leetkob.example/problems/unauthorized"`

---

### CT-05: Student Role Calling Publish
- **Contract Reference**: §4.1 Who may call it & Processing step 4
- **Preconditions**:
  - Student user `student_1` enrolled in `CLASS_A`.
  - Lab `lab_1` belongs to `CLASS_A`.
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - Header: `Authorization: Bearer <token_for_student_1>`
- **Expected Response**:
  - HTTP Status: `403 Forbidden`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body:
    - `type`: `"https://leetkob.example/problems/forbidden"`
    - `title`: `"Forbidden"`
    - `status`: `403`
    - `code`: `"FORBIDDEN"`
    - `instance`: `"/v1/labs/{lab_1.id}/publish"`
- **Database Post-condition**: Lab state remains unchanged.

---

### CT-06: Ownership Rule — TA of Class B Calling Lab of Class A
- **Contract Reference**: §4.1 Who may call it & Processing step 4
- **Preconditions**:
  - `CLASS_A` has TA `ta_user_1` and Lab `lab_1`.
  - `CLASS_B` has TA `ta_user_2`.
  - `ta_user_2` is **not** assigned to `CLASS_A`.
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - Header: `Authorization: Bearer <token_for_ta_user_2>`
- **Expected Response**:
  - HTTP Status: `403 Forbidden`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body `code`: `"FORBIDDEN"`
  - Body `type`: `"https://leetkob.example/problems/forbidden"`
- **Database Post-condition**: Lab `lab_1` state is not updated.

---

### CT-07: Valid UUID but Lab Does Not Exist
- **Contract Reference**: §4.1 Processing step 3
- **Preconditions**: No lab with UUID `a0000000-0000-0000-0000-000000000000` exists.
- **Request**:
  - `POST /v1/labs/a0000000-0000-0000-0000-000000000000/publish`
  - Header: `Authorization: Bearer <token_for_ta_user_1>`
- **Expected Response**:
  - HTTP Status: `404 Not Found`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body:
    - `type`: `"https://leetkob.example/problems/not-found"`
    - `title`: `"Lab not found"`
    - `status`: `404`
    - `code`: `"LAB_NOT_FOUND"`
    - `instance`: `"/v1/labs/a0000000-0000-0000-0000-000000000000/publish"`

---

### CT-08: Required Review Pending — Violation or Unsure Verdicts
- **Contract Reference**: §4.1 Processing step 6
- **Preconditions**:
  - Lab `lab_pending_v` has at least 1 constraint review with verdict `violation` or `unsure` that is unreviewed / unresolved.
- **Request**:
  - `POST /v1/labs/{lab_pending_v.id}/publish`
  - Header: `Authorization: Bearer <token_for_assigned_ta>`
- **Expected Response**:
  - HTTP Status: `409 Conflict`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body:
    - `type`: `"https://leetkob.example/problems/reviews-pending"`
    - `title`: `"Required reviews are pending"`
    - `status`: `409`
    - `code`: `"REVIEWS_PENDING"`
    - `instance`: `"/v1/labs/{lab_pending_v.id}/publish"`
- **Database Post-condition**: Lab remains in `DRAFT` status; `publishedAt` remains `null`.

---

### CT-09: Required Review Pending — 10% Sampled Pass Verdict
- **Contract Reference**: §4.1 Processing step 6 & §3.2
- **Preconditions**:
  - Lab `lab_pending_pass` has all `violation` and `unsure` reviews resolved, but has 1 submission with a sampled `pass` verdict marked for TA human gate check that is still pending.
- **Request**:
  - `POST /v1/labs/{lab_pending_pass.id}/publish`
  - Header: `Authorization: Bearer <token_for_assigned_ta>`
- **Expected Response**:
  - HTTP Status: `409 Conflict`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body `code`: `"REVIEWS_PENDING"`
  - Body `type`: `"https://leetkob.example/problems/reviews-pending"`
- **Database Post-condition**: Lab status remains `DRAFT`.

---

### CT-10: Invalid labId Format (Not a Canonical UUID)
- **Contract Reference**: §4.1 Processing step 2
- **Preconditions**: None.
- **Request**:
  - `POST /v1/labs/not-a-valid-uuid/publish`
  - Header: `Authorization: Bearer <token_for_ta_user_1>`
- **Expected Response**:
  - HTTP Status: `400 Bad Request`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body:
    - `type`: `"https://leetkob.example/problems/invalid-request"`
    - `title`: `"Invalid request"`
    - `status`: `400`
    - `code`: `"INVALID_REQUEST"`
    - `errors`: array containing `{ "parameter": "labId", "detail": "..." }`

---

### CT-11: Idempotency — Re-calling Publish on Already Published Lab
- **Contract Reference**: §4.1 Idempotency check (Step 5)
- **Preconditions**:
  - Lab `lab_pub` was already published earlier at `2026-11-08T06:00:00.000Z`.
- **Request**:
  - `POST /v1/labs/{lab_pub.id}/publish`
  - Header: `Authorization: Bearer <token_for_assigned_ta>`
- **Expected Response**:
  - HTTP Status: `200 OK`
  - Header: `Content-Type: application/json; charset=utf-8`
  - Header **`Idempotent-Replayed: true`** MUST be present.
  - Body:
    ```json
    {
      "labId": "{lab_pub.id}",
      "status": "PUBLISHED",
      "publishedAt": "2026-11-08T06:00:00.000Z"
    }
    ```
- **Database Post-condition**:
  - `publishedAt` in database remains strictly `"2026-11-08T06:00:00.000Z"`.
  - No new publication records or duplicate side effects created.

---

### CT-12: Concurrent Publish Requests
- **Contract Reference**: §4.1 Concurrency & Race conditions
- **Preconditions**:
  - Lab `lab_concurrent` is in `DRAFT` status and ready to publish.
- **Execution**:
  - Send two identical `POST /v1/labs/{lab_concurrent.id}/publish` requests concurrently using `Promise.all([req1, req2])`.
- **Expected Response**:
  - Both requests return `200 OK`.
  - Both responses report the **identical `publishedAt` timestamp**.
  - One response may have `Idempotent-Replayed: true` if serialized, but both reflect consistent final state.
- **Database Post-condition**: Exactly one state transition occurred.

---

### CT-13: Security Precedes Idempotency on Already Published Lab
- **Contract Reference**: §4.1 Idempotency & Concurrency (Ownership enforcement on replay)
- **Preconditions**:
  - Lab `lab_pub` is already `PUBLISHED`.
- **Request**:
  - `POST /v1/labs/{lab_pub.id}/publish`
  - Header: `Authorization: Bearer <token_for_student>` (or TA from another class)
- **Expected Response**:
  - HTTP Status: `403 Forbidden`
  - Header: `Content-Type: application/problem+json; charset=utf-8`
  - Body `code`: `"FORBIDDEN"`
- **Database Post-condition**: Lab remains untouched. An unauthorized caller cannot inspect or replay publish state.

---

### CT-14: Extensibility — Non-empty Unexpected Request Body is Safely Ignored
- **Contract Reference**: §1 Conventions (Extensibility) & §4.1 Request Body
- **Preconditions**:
  - Lab `lab_1` is in `DRAFT` status and ready to publish.
- **Request**:
  - `POST /v1/labs/{lab_1.id}/publish`
  - Header: `Authorization: Bearer <token_for_assigned_ta>`
  - Header: `Content-Type: application/json`
  - Body: `{"unexpectedField": "maliciousOrExtraValue", "status": "TAMPERED"}`
- **Expected Response**:
  - HTTP Status: `200 OK`
  - Body `status` is strictly `"PUBLISHED"`, and unexpected body fields have zero effect.
- **Database Post-condition**: Lab is published normally without corrupted fields.
