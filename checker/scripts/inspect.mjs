#!/usr/bin/env node
/**
 * Interactive CLI Inspector for @leetkob/checker.
 * Shows exact Input -> Output at every stage of the pipeline:
 *   1. preprocess  : stripCommentsKeepLines() + splitLines()
 *   2. classify    : classifyConstraint() + bannedNames()
 *   3. hard-rules  : evaluateHardRules() (C++ AST via web-tree-sitter)
 *   4. prompt      : cost-cap check + buildAnonymizedPrompt()
 *   5. full        : checkSubmission() (judge + applyGuardrails)
 *
 * Usage:
 *   node checker/scripts/inspect.mjs --code <file.cpp> --constraints <constraints.json> [options]
 *   node checker/scripts/inspect.mjs --code <file.cpp> --rule "Do not use `std::sort`." --rule "Use recursion."
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const distIndexPath = resolve(__dirname, '../dist/index.js');
const distCliPath = resolve(__dirname, '../dist/cli.js');
if (!existsSync(distIndexPath)) {
  console.error('Error: checker/dist/index.js not found. Run `npm run build:libs` first.');
  process.exit(1);
}

const {
  AnthropicJudge,
  bannedNames,
  buildAnonymizedPrompt,
  checkSubmission,
  classifyConstraint,
  evaluateHardRules,
  FakeJudge,
  GeminiJudge,
  loadCheckerConfig,
  splitLines,
  stripCommentsKeepLines
} = require(distIndexPath);
const { loadEnvFile } = require(distCliPath);

function printUsage() {
  console.log(`Usage:
  node checker/scripts/inspect.mjs --code <file.cpp> [--constraints <file.json> | --rule "<text>" ...] [options]

Options:
  --code <path>             Path to C++ source file (required)
  --constraints <path>      Path to constraints.json (array of { id, text })
  --rule "<text>"           Add a constraint inline (can be repeated)
  --statement "<text>"      Lab statement text
  --statement-file <path>   Path to statement.md
  --mode <mode>             fake-valid (default) | fake-wrong-evidence | fake-invalid-json |
                            fake-slow | off | gemini | anthropic
  --step <step>             all (default) | preprocess | classify | hard-rules | prompt | full
  --lab-spent <usd>         Simulated spend so far for this lab (default: 0)
  --lab-cap <usd>           Override per-lab cost cap (default: from .env or 3.0)
  --timeout-ms <ms>         Override timeout in ms
  -h, --help                Show this help
`);
}

function parseArgs(argv) {
  const opts = {
    codePath: undefined,
    constraintsPath: undefined,
    rules: [],
    statement: undefined,
    statementFile: undefined,
    mode: 'fake-valid',
    step: 'all',
    labSpentUsd: 0,
    labCapUsd: undefined,
    timeoutMs: undefined
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    } else if (a === '--code') {
      opts.codePath = argv[++i];
    } else if (a === '--constraints') {
      opts.constraintsPath = argv[++i];
    } else if (a === '--rule') {
      opts.rules.push(argv[++i]);
    } else if (a === '--statement') {
      opts.statement = argv[++i];
    } else if (a === '--statement-file') {
      opts.statementFile = argv[++i];
    } else if (a === '--mode') {
      opts.mode = argv[++i];
    } else if (a === '--step') {
      opts.step = argv[++i];
    } else if (a === '--lab-spent') {
      opts.labSpentUsd = Number(argv[++i]);
    } else if (a === '--lab-cap') {
      opts.labCapUsd = Number(argv[++i]);
    } else if (a === '--timeout-ms') {
      opts.timeoutMs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (!opts.codePath) {
    throw new Error('--code <file.cpp> is required (use --help for usage)');
  }
  return opts;
}

function formatNumberedCode(code) {
  return splitLines(code)
    .map((line, i) => `  ${String(i + 1).padStart(3, ' ')} | ${line}`)
    .join('\n');
}

function buildJudge(mode) {
  if (mode === 'off') return { modelOff: true, judge: undefined };
  if (mode === 'fake-valid') return { modelOff: false, judge: new FakeJudge({ mode: 'valid' }) };
  if (mode === 'fake-wrong-evidence') {
    return { modelOff: false, judge: new FakeJudge({ mode: 'wrong-evidence' }) };
  }
  if (mode === 'fake-invalid-json') {
    return { modelOff: false, judge: new FakeJudge({ mode: 'invalid-json' }) };
  }
  if (mode === 'fake-slow') {
    return { modelOff: false, judge: new FakeJudge({ mode: 'slow', delayMs: 120 }) };
  }
  if (mode === 'gemini') return { modelOff: false, judge: new GeminiJudge() };
  if (mode === 'anthropic') return { modelOff: false, judge: new AnthropicJudge() };
  throw new Error(`Unsupported --mode: ${mode}`);
}

function header(title) {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}`);
}

function loadConstraints(opts) {
  const constraints = [];
  if (opts.constraintsPath) {
    const raw = JSON.parse(readFileSync(resolve(opts.constraintsPath), 'utf8'));
    for (const c of raw) {
      constraints.push({ id: c.id, code: c.id, text: c.text });
    }
  }
  opts.rules.forEach((text, idx) => {
    const code = `C${constraints.length + 1 + idx}`;
    constraints.push({ id: code, code, text });
  });
  if (constraints.length === 0) {
    throw new Error(
      'Provide at least one constraint via --constraints <file.json> or --rule "<text>"'
    );
  }
  return constraints;
}

async function main() {
  loadEnvFile(resolve(__dirname, '../.env'));
  const opts = parseArgs(process.argv.slice(2));
  const cfg = loadCheckerConfig();

  const codePath = resolve(opts.codePath);
  const originalCode = readFileSync(codePath, 'utf8');
  const statement = opts.statementFile
    ? readFileSync(resolve(opts.statementFile), 'utf8').trim()
    : (opts.statement ?? 'Check the C++ submission against the declared constraints.');
  const constraints = loadConstraints(opts);

  const show = (name) => opts.step === 'all' || opts.step === name;

  // --- STAGE 1: PREPROCESS ---
  const strippedCode = stripCommentsKeepLines(originalCode);
  if (show('preprocess')) {
    header('STAGE 1: preprocess.ts -> stripCommentsKeepLines(code)');
    console.log(`Input file: ${codePath}`);
    console.log('\n[Original code]');
    console.log(formatNumberedCode(originalCode));
    console.log('\n[Stripped code (comments removed, 1-based line numbers preserved)]');
    console.log(formatNumberedCode(strippedCode));
  }

  // --- STAGE 2: CLASSIFY ---
  const banConstraints = [];
  const semanticConstraints = [];
  const classifiedRows = constraints.map((c) => {
    const kind = classifyConstraint(c.text);
    const names = kind === 'BAN_LIST' ? bannedNames(c.text) : [];
    if (kind === 'BAN_LIST') banConstraints.push(c);
    else semanticConstraints.push(c);
    return { code: c.code, kind, bannedNames: names, text: c.text };
  });

  if (show('classify')) {
    header('STAGE 2: classify.ts -> classifyConstraint() & bannedNames()');
    console.log(JSON.stringify(classifiedRows, null, 2));
  }

  // --- STAGE 3: HARD RULES (AST) ---
  const hardVerdicts = await evaluateHardRules(banConstraints, originalCode, strippedCode);
  if (show('hard-rules')) {
    header('STAGE 3: hard-rules.ts -> evaluateHardRules() (web-tree-sitter C++ AST)');
    if (banConstraints.length === 0) {
      console.log('No BAN_LIST constraints to evaluate.');
    } else {
      console.log(JSON.stringify(hardVerdicts, null, 2));
    }
  }

  // --- STAGE 4: COST CAP & ANONYMIZED PROMPT ---
  const effectiveCap = opts.labCapUsd ?? cfg.labCapUsd;
  if (show('prompt')) {
    header('STAGE 4: cost-cap.ts & prompt.ts -> Cost Cap & Anonymized AI Prompt');
    console.log(
      `Config: mode=${opts.mode}, labSpentUsd=$${opts.labSpentUsd}, labCapUsd=$${effectiveCap}, timeoutMs=${opts.timeoutMs ?? cfg.timeoutMs}`
    );
    if (semanticConstraints.length === 0) {
      console.log('No SEMANTIC constraints -> AI will NOT be called ($0).');
    } else {
      const prompt = buildAnonymizedPrompt({
        statement,
        constraints: semanticConstraints,
        code: strippedCode
      });
      console.log('\n[Prompt sent to AI (ONLY SEMANTIC constraints + comment-stripped code)]');
      console.log(prompt);
    }
  }

  // --- STAGE 5: FULL PIPELINE (JUDGE + GUARDRAIL) ---
  if (show('full')) {
    header('STAGE 5: index.ts + guardrail.ts -> checkSubmission() Final Result');
    const { modelOff, judge } = buildJudge(opts.mode);
    const timeoutMs =
      opts.timeoutMs ?? (opts.mode === 'fake-slow' ? 30 : cfg.timeoutMs);

    const result = await checkSubmission(
      { statement, constraints, code: originalCode },
      {
        modelOff,
        judge,
        timeoutMs,
        labSpentUsd: opts.labSpentUsd,
        labCapUsd: effectiveCap
      }
    );

    console.log('[Model Calls]');
    console.log(
      JSON.stringify(
        result.calls.map(({ prompt: _p, ...rest }) => rest),
        null,
        2
      )
    );
    console.log('\n[Final Verdicts (in original input.constraints order)]');
    console.log(JSON.stringify(result.verdicts, null, 2));
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
