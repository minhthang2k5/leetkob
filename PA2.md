# LeeTKOB PA#2 — Submission Evidence (PA2.md)

**Course**: CSC13114 · Class 2609-AWAD-23/3  
**Milestone**: PA#2 — Harness and Quality Gate  
**Team**: LeeTKOB  
**Repository**: [https://github.com/minhthang2k5/leetkob](https://github.com/minhthang2k5/leetkob)

---

## 1. Summary of Required Links

| Item | Description | URL / Reference |
|---|---|---|
| **Public Repository** | Official project repository | [https://github.com/minhthang2k5/leetkob](https://github.com/minhthang2k5/leetkob) |
| **Branch Protection** | Screenshot / Settings link showing required checks & approvals | *(Insert link / screenshot to Settings > Rules / Branch protection)* |
| **Red PR (Blocked)** | Demonstration of CI quality gate blocking failing code | *(Insert link to blocked Pull Request)* |
| **Green PR (Merged)** | Demonstration of CI quality gate passing with required approvals | *(Insert link to merged Pull Request)* |
| **Contract Break Catch**| Proof that contract tests catch deliberate contract violations | *(Insert link to commit / CI run catching deliberate break)* |
| **Submission Tag CI** | GitHub Actions workflow run for tag `pa2` | [https://github.com/minhthang2k5/leetkob/actions](https://github.com/minhthang2k5/leetkob/actions) *(Target tag: `pa2`)* |

---

## 2. Quality Gate Commands (One Command Per Check)

All checks run non-interactively and return standard exit codes (`0` on success, `1` on failure):

```bash
# In backend/ directory:
npm run lint          # 1. Linting: eslint src tests --ext .ts
npm run format:check   # 2. Formatting: prettier --check "src/**/*.ts" "tests/**/*.ts"
npm run typecheck      # 3. Type checking: tsc --noEmit
npm test               # 4. Contract test suite: vitest run
```

---

## 3. Deliberate Contract Break Demonstration

- **Break Scenario**: In `backend/src/services/lab.service.ts`, the business check for pending reviews (`if (pendingCount > 0)`) was commented out.
- **Result in CI**: Contract tests `CT-08` and `CT-09` immediately failed with `409 Conflict expected, received 200 OK`.
- **Resolution**: Restored the pending reviews invariant; CI turned green, and the PR became mergeable.
