#!/usr/bin/env node
// The dev set must stay byte-identical to the published leetkob-eval (rubric criterion 6:
// changing it scores 0). Graders check two SHA-256 prefixes; so does this script, in CI.
//
//   node scripts/check-eval-data.mjs [dir]        (default: eval/leetkob-eval)
//
// A missing folder is a warning, unless REQUIRE_EVAL_DATA=1 (CI sets it on the pa3 tag).
// Exit 0 = matches (or missing and not required), 1 = mismatch or required and missing.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const EXPECTED = {
  'eval.mjs': 'c836edd8713521bb',
  'labels.jsonl': '262cda7b0ef5612e'
};

const dir = process.argv[2] ?? 'eval/leetkob-eval';
const required = process.env.REQUIRE_EVAL_DATA === '1';

if (!existsSync(dir)) {
  const message = `${dir} not found: the published dev set has not been copied in yet.`;
  if (required) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.warn(`WARN ${message} (required only on the pa3 tag)`);
  process.exit(0);
}

/** Every file under `root` with one of the expected names. */
function find(root) {
  const found = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) found.push(...find(path));
    else if (entry in EXPECTED) found.push(path);
  }
  return found;
}

const files = find(dir);
let ok = true;
for (const name of Object.keys(EXPECTED)) {
  const matches = files.filter((f) => f.endsWith(name));
  if (matches.length === 0) {
    console.error(`FAIL ${name} is missing under ${dir}`);
    ok = false;
  }
  for (const file of matches) {
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    const good = sha.startsWith(EXPECTED[name]);
    console.log(`${good ? 'OK  ' : 'FAIL'} ${relative('.', file)} sha256 ${sha.slice(0, 16)}`);
    if (!good) {
      console.error(`     expected a hash starting with ${EXPECTED[name]}`);
      ok = false;
    }
  }
}
process.exit(ok ? 0 : 1);
