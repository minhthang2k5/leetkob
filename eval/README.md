# eval/

## `leetkob-eval/`: the published dev set (do not edit)

A byte-identical copy of <https://github.com/fithcmus/awad-leetkob-eval>, commit
`552c811db2d35a23d641bc4fdffc1ac120be1a28` (2026-10-22): 6 problems, 47 Accepted solutions,
102 labelled (solution, constraint) pairs. Its own `leetkob-eval/README.md` explains the layout,
the prediction format and the three metrics.

- **Never edit anything in it** (rubric criterion 6 scores 0 if `eval.mjs`, `labels.jsonl` or a
  `.cpp` changes). `node scripts/check-eval-data.mjs` checks the SHA-256 of `eval.mjs`
  (`c836edd8713521bb…`) and `labels.jsonl` (`262cda7b0ef5612e…`); the CI job `eval-data` runs it.
- Its files use CRLF line endings and the hashes are of those bytes. `.gitattributes` marks the
  folder `-text`, so git never converts them. Do not open and re-save them in an editor.
- `eval.mjs` needs **Node 22 or later**:
  `node eval/leetkob-eval/eval.mjs --data eval/leetkob-eval --predictions <file>.jsonl`.
- Never name or quote a dev-set case in a prompt, a hard rule or a checker test (AGENTS.md).

## Our own cases and runs (owner N2)

- `own-cases/`: at least 5 cases with the same layout (`problems/`, `solutions/`, `labels.jsonl`),
  with labels and tags, at least one `trap` and one `injection`.
- `runs/<date>/`: the committed real-model run: `predictions.jsonl`, the `eval.mjs` report and the
  call log with the provider's request ids.
