#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CheckConstraint, ModelCallLog, SemanticJudge } from '@leetkob/shared';
import { AnthropicJudge } from './anthropic-judge';
import {
  DEFAULT_GEMINI_CLI_DELAY_MS,
  DEFAULT_GEMINI_CLI_TIMEOUT_MS,
  loadCheckerConfig
} from './config';
import { GeminiJudge } from './gemini-judge';
import { checkSubmission } from './index';

interface DatasetConstraint {
  id: string;
  text: string;
  deduction?: number;
}

export interface CliOptions {
  datasetDir: string;
  outPath: string;
  callsOutPath?: string;
  provider?: 'anthropic' | 'gemini';
  modelOff: boolean;
  timeoutMs?: number;
  delayMs?: number;
  judge?: SemanticJudge;
}

export interface PredictionRecord {
  solution: string;
  constraint: string;
  verdict: 'pass' | 'violation' | 'unsure';
  evidence: Array<{ line: number; text: string }>;
}

export function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && val && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function loadDefaultEnvFiles(): void {
  const candidates = [
    resolve(__dirname, '../.env'),
    resolve(process.cwd(), 'checker/.env'),
    resolve(process.cwd(), '.env')
  ];
  for (const p of candidates) {
    loadEnvFile(p);
  }
}

export function parseCliArgs(argv: string[]): CliOptions {
  let datasetDir: string | undefined;
  let outPath: string | undefined;
  let callsOutPath: string | undefined;
  let provider: 'anthropic' | 'gemini' | undefined;
  let modelOff = process.env.MODEL_OFF === '1';
  let timeoutMs: number | undefined;
  let delayMs: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      outPath = argv[++i];
    } else if (arg === '--data') {
      datasetDir = argv[++i];
    } else if (arg === '--calls-out') {
      callsOutPath = argv[++i];
    } else if (arg === '--provider') {
      const p = argv[++i];
      if (p !== 'anthropic' && p !== 'gemini') {
        throw new Error(`Unsupported provider: ${p}`);
      }
      provider = p;
    } else if (arg === '--timeout-ms') {
      timeoutMs = Number(argv[++i]);
    } else if (arg === '--delay-ms') {
      delayMs = Number(argv[++i]);
    } else if (arg === '--model-off') {
      modelOff = true;
    } else if (!arg.startsWith('-') && !datasetDir) {
      datasetDir = arg;
    } else {
      throw new Error(`Unknown or unexpected argument: ${arg}`);
    }
  }

  if (!datasetDir || !outPath) {
    throw new Error(
      'Usage: leetcob-checker <dataset_dir> --out <predictions.jsonl> [--calls-out <calls.jsonl>] [--provider anthropic|gemini] [--delay-ms <ms>] [--model-off]'
    );
  }

  return { datasetDir, outPath, callsOutPath, provider, modelOff, timeoutMs, delayMs };
}

export async function runCli(opts: CliOptions): Promise<{
  predictions: PredictionRecord[];
  calls: Array<ModelCallLog & { solution: string }>;
}> {
  const root = resolve(opts.datasetDir);
  const problemsDir = join(root, 'problems');
  const solutionsDir = join(root, 'solutions');

  if (!existsSync(problemsDir) || !existsSync(solutionsDir)) {
    throw new Error(`Invalid dataset directory: ${root}`);
  }

  const cfg = loadCheckerConfig();
  // Mặc định ưu tiên theo CHECKER_PROVIDER / --provider; nếu 'auto' thì chọn Gemini
  // khi có GEMINI_API_KEY (và không có ANTHROPIC_API_KEY).
  const resolvedProvider =
    opts.provider ?? (cfg.provider === 'auto' ? undefined : cfg.provider);
  const useGemini =
    resolvedProvider === 'gemini' ||
    (!resolvedProvider && Boolean(cfg.geminiApiKey) && !cfg.anthropicApiKey);

  const judge = opts.modelOff
    ? undefined
    : (opts.judge ??
      (useGemini
        ? new GeminiJudge({
            maxRetries: cfg.maxRetries,
            retryDelayMs: cfg.retryDelayMs
          })
        : new AnthropicJudge()));
  const delayMs =
    opts.delayMs ??
    cfg.delayMs ??
    (useGemini && !opts.modelOff ? DEFAULT_GEMINI_CLI_DELAY_MS : 0);
  const timeoutMs =
    opts.timeoutMs ??
    (process.env.CHECKER_TIMEOUT_MS
      ? cfg.timeoutMs
      : useGemini
        ? DEFAULT_GEMINI_CLI_TIMEOUT_MS
        : cfg.timeoutMs);
  const problemIds = readdirSync(problemsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const predictions: PredictionRecord[] = [];
  const allCalls: Array<ModelCallLog & { solution: string }> = [];

  for (const pid of problemIds) {
    const statementPath = join(problemsDir, pid, 'statement.md');
    const constraintsPath = join(problemsDir, pid, 'constraints.json');
    const solProblemDir = join(solutionsDir, pid);

    if (!existsSync(statementPath) || !existsSync(constraintsPath)) {
      throw new Error(`Missing statement.md or constraints.json for problem ${pid}`);
    }
    if (!existsSync(solProblemDir)) continue;

    const statement = readFileSync(statementPath, 'utf8');
    const rawConstraints = JSON.parse(
      readFileSync(constraintsPath, 'utf8')
    ) as DatasetConstraint[];
    const constraints: CheckConstraint[] = rawConstraints.map((c) => ({
      id: c.id,
      code: c.id,
      text: c.text
    }));

    const cppFiles = readdirSync(solProblemDir)
      .filter((f) => f.endsWith('.cpp'))
      .sort();

    for (const file of cppFiles) {
      const solutionId = `${pid}/${file.replace(/\.cpp$/, '')}`;
      const code = readFileSync(join(solProblemDir, file), 'utf8');
      const isDirectCli = process.env.NODE_ENV !== 'test' && require.main === module;
      if (isDirectCli) {
        process.stdout.write(`${solutionId} ... `);
      }
      const result = await checkSubmission(
        { statement, constraints, code },
        {
          modelOff: opts.modelOff,
          judge,
          timeoutMs
        }
      );

      if (isDirectCli) {
        const callInfo =
          result.calls.length > 0
            ? `${result.calls[0].provider}:${result.calls[0].model} ${result.calls[0].status} (${result.calls[0].ms}ms)`
            : 'HARD_RULE_ONLY';
        console.log(callInfo);
      }

      if (result.calls.length > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Chuyển verdict sang chữ thường ("pass" | "violation" | "unsure") vì `eval.mjs`
      // yêu cầu chữ thường (khác với DB/API dùng chữ HOA).
      for (const v of result.verdicts) {
        predictions.push({
          solution: solutionId,
          constraint: v.constraintCode,
          verdict: v.verdict.toLowerCase() as PredictionRecord['verdict'],
          evidence: v.evidence
        });
      }

      for (const call of result.calls) {
        allCalls.push({ solution: solutionId, ...call });
      }
    }
  }

  const outFile = resolve(opts.outPath);
  mkdirSync(dirname(outFile), { recursive: true });
  const jsonl = predictions.map((p) => JSON.stringify(p)).join('\n') + '\n';
  writeFileSync(outFile, jsonl, 'utf8');

  if (opts.callsOutPath) {
    const callsFile = resolve(opts.callsOutPath);
    mkdirSync(dirname(callsFile), { recursive: true });
    const callsJsonl = allCalls.map((c) => JSON.stringify(c)).join('\n') + '\n';
    writeFileSync(callsFile, callsJsonl, 'utf8');
  }

  return { predictions, calls: allCalls };
}

async function main(): Promise<void> {
  loadDefaultEnvFiles();
  const opts = parseCliArgs(process.argv.slice(2));
  const { predictions, calls } = await runCli(opts);
  const totalCost = calls.reduce((sum, c) => sum + c.costUsd, 0);
  console.log(
    `Wrote ${predictions.length} predictions to ${opts.outPath} (${calls.length} model calls, $${totalCost.toFixed(6)})`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
