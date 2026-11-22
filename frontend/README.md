# LeeTKOB frontend

React 18 + Vite + TypeScript. Screens for the PA#3 flow: sign in, a TA creates a lab with
constraints, a student submits and watches the submission go from queued to judged, the TA
works through the review queue (verdicts and evidence lines marked on the code) and publishes.

## Run

```bash
cd frontend
npm ci
npm run dev:mock     # in-memory API, no backend needed: http://localhost:5173
npm run dev          # real backend: /v1 is proxied to http://localhost:3000
```

Mock accounts (mock mode only, password `demo`): `admin`, `ta.a` (class A), `ta.b`
(class B), `sv.an`, `sv.binh` (students of class A). Point the proxy elsewhere with
`VITE_BACKEND_URL=http://host:port npm run dev`.

## Checks (same idea as `backend/`)

```bash
npm run lint
npm run format:check   # fix with: npm run format
npm run typecheck
npm test               # rules of the mock API the screens rely on
npm run build          # static files in dist/
```

## How it fits

- `src/api/types.ts` and [`API.md`](API.md) are the endpoints the UI expects. They are a
  draft from the frontend side; the backend contract in `docs/contract/` wins, and this
  side follows it.
- `src/api/http.ts` talks only to this site's own `/v1`. In production serve `dist/` from
  the same host as the API, so there is no CORS and the browser never holds anything but
  the user's session token. **No model key or backend secret ever goes into the frontend.**
- `src/api/mock.ts` imitates the server rules the UI depends on (roles, a TA of another
  class gets 403, students never see verdicts, publish refuses with 409 while reviews are
  pending). Its "verdicts" are fake demo data, not the checker.
- Hiding a button is never the protection: every permission check is the server's.

## Design

One distinctive element: the submission is shown like a line-printer listing on green-bar
paper, with each evidence line underlined in the grader's pen and the constraint noted in
the margin. A `≠` beside a margin note means the quoted evidence text does not match that
line of the code. Everything else stays quiet. Fonts: Atkinson Hyperlegible (UI),
JetBrains Mono (code).
