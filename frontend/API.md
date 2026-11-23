# API the frontend calls

The specification is [`docs/contract/pa3-interfaces.md`](../docs/contract/pa3-interfaces.md),
Part B (auth, labs, submissions, review queue) and
[`docs/contract/publish.md`](../docs/contract/publish.md) (publish). This file used to be the
frontend's own draft; it now only maps each call in `src/api/types.ts` to its section, so
there is one source of truth.

| `Api` method | Method and path | Contract |
|---|---|---|
| `login` | `POST /v1/auth/login` | B.3 |
| `me` | `GET /v1/me` | B.3 |
| `listLabs` | `GET /v1/classes/{classId}/labs` | B.4 |
| `createLab` | `POST /v1/classes/{classId}/labs` | B.4 |
| `getLab` | `GET /v1/labs/{labId}` | B.4 (a student gets `tests: []` and no `deduction`) |
| `submit` | `POST /v1/labs/{labId}/submissions` | B.5 (`429` with `Retry-After` past the limit) |
| `listSubmissions` | `GET /v1/labs/{labId}/submissions` | B.5 |
| `getSubmission` | `GET /v1/submissions/{submissionId}` | B.5 |
| `getReviewQueue` | `GET /v1/labs/{labId}/review-queue` | B.6 |
| `review` | `POST /v1/verdicts/{verdictId}/review` | B.6 |
| `publish` | `POST /v1/labs/{labId}/publish` | `publish.md` |

The UI branches on the problem `code`, never on `title` or `detail`
(`src/api/problem.ts`, `describeProblem`). The mock (`src/api/mock.ts`) follows the same
rules so the screens behave the same in both modes.
