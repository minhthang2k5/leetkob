# Evidence: protected `main`

Taken on 2026-11-11 from https://github.com/minhthang2k5/leetkob/settings/rules (ruleset `Protect-main`).

| File | Shows |
|---|---|
| `main-protection-1-ruleset-active-bypass-empty.png` | Ruleset name, enforcement **Active**, bypass list empty |
| `main-protection-2-target-main-branch-rules.png` | Target: default branch (`main`, "Applies to 1 target"); Restrict deletions |
| `main-protection-3-pull-request-1-approval.png` | Require a pull request before merging, 1 required approval |
| `main-protection-4-required-status-checks.png` | Required checks: `format-check`, `typecheck`, `lint`, `test` (GitHub Actions) |
| `main-protection-5-block-force-pushes.png` | Block force pushes |
| `main-protection-ruleset.json` | The same ruleset as returned by the GitHub API (`GET /repos/minhthang2k5/leetkob/rulesets/{id}`) |

Checks run by `.github/workflows/ci.yml`. The screenshots are what the settings page showed; the JSON is the machine-readable record of the saved ruleset.
