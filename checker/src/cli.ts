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
import type { CheckerConfig } from './config';
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

interface SolutionTask {
  solutionId: string;
  statement: string;
  constraints: CheckConstraint[];
  code: string;
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

function parseProviderFlag(value: string): 'anthropic' | 'gemini' {
  if (value !== 'anthropic' && value !== 'gemini') {
    throw new Error(`Unsupported provider: ${value}`);
  }
  return value;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const state: Partial<CliOptions> & { modelOff: boolean } = {
    modelOff: process.env.MODEL_OFF === '1'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--out':
      case '-o':
        state.outPath = argv[++i];
        break;
      case '--data':
        state.datasetDir = argv[++i];
        break;
      case '--calls-out':
        state.callsOutPath = argv[++i];
        break;
      case '--provider':
        state.provider = parseProviderFlag(argv[++i]);
        break;
      case '--timeout-ms':
        state.timeoutMs = Number(argv[++i]);
        break;
      case '--delay-ms':
        state.delayMs = Number(argv[++i]);
        break;
      case '--model-off':
        state.modelOff = true;
        break;
      default:
        if (!arg.startsWith('-') && !state.datasetDir) {
          state.datasetDir = arg;
        } else {
          throw new Error(`Unknown or unexpected argument: ${arg}`);
        }
    }
  }

  if (!state.datasetDir || !state.outPath) {
    throw new Error(
      'Usage: leetcob-checker <dataset_dir> --out <predictions.jsonl> [--calls-out <calls.jsonl>] [--provider anthropic|gemini] [--delay-ms <ms>] [--model-off]'
    );
  }

  return state as CliOptions;
}

function resolveTimeoutMs(
  opts: CliOptions,
  cfg: CheckerConfig,
  useGemini: boolean
): number {
  if (opts.timeoutMs !== undefined) return opts.timeoutMs;
  if (process.env.CHECKER_TIMEOUT_MS) return cfg.timeoutMs;
  return useGemini ? DEFAULT_GEMINI_CLI_TIMEOUT_MS : cfg.timeoutMs;
}

function buildJudgeForCli(
  opts: CliOptions,
  cfg: CheckerConfig,
  useGemini: boolean
): SemanticJudge | undefined {
  if (opts.modelOff) return undefined;
  if (opts.judge) return opts.judge;
  if (useGemini) {
    return new GeminiJudge({
      maxRetries: cfg.maxRetries,
      retryDelayMs: cfg.retryDelayMs
    });
  }
  return new AnthropicJudge();
}

function resolveRuntimeJudge(
  opts: CliOptions,
  cfg: CheckerConfig
): { judge: SemanticJudge | undefined; delayMs: number; timeoutMs: number } {
  const resolvedProvider =
    opts.provider ?? (cfg.provider === 'auto' ? undefined : cfg.provider);
  const useGemini =
    resolvedProvider === 'gemini' ||
    (!resolvedProvider && Boolean(cfg.geminiApiKey) && !cfg.anthropicApiKey);

  const judge = buildJudgeForCli(opts, cfg, useGemini);
  const defaultDelay = useGemini && !opts.modelOff ? DEFAULT_GEMINI_CLI_DELAY_MS : 0;
  const delayMs = opts.delayMs ?? cfg.delayMs ?? defaultDelay;
  const timeoutMs = resolveTimeoutMs(opts, cfg, useGemini);

  return { judge, delayMs, timeoutMs };
}

function collectDatasetTasks(root: string): SolutionTask[] {
  const problemsDir = join(root, 'problems');
  const solutionsDir = join(root, 'solutions');
  if (!existsSync(problemsDir) || !existsSync(solutionsDir)) {
    throw new Error(`Invalid dataset directory: ${root}`);
  }

  const problemIds = readdirSync(problemsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const tasks: SolutionTask[] = [];
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
      tasks.push({
        solutionId: `${pid}/${file.replace(/\.cpp$/, '')}`,
        statement,
        constraints,
        code: readFileSync(join(solProblemDir, file), 'utf8')
      });
    }
  }
  return tasks;
}

async function runSingleTask(
  task: SolutionTask,
  opts: CliOptions,
  judge: SemanticJudge | undefined,
  timeoutMs: number,
  delayMs: number,
  predictions: PredictionRecord[],
  allCalls: Array<ModelCallLog & { solution: string }>
): Promise<void> {
  const isDirectCli = process.env.NODE_ENV !== 'test' && require.main === module;
  if (isDirectCli) {
    process.stdout.write(`${task.solutionId} ... `);
  }

  const result = await checkSubmission(
    { statement: task.statement, constraints: task.constraints, code: task.code },
    { modelOff: opts.modelOff, judge, timeoutMs }
  );

  if (isDirectCli) {
    const callInfo =
      result.calls.length > 0
        ? `${result.calls[0].provider}:${result.calls[0].model} ${result.calls[0].status} (${result.calls[0].ms}ms)`
        : 'HARD_RULE_ONLY';
    console.log(callInfo);
  }

  // Chuyển verdict sang chữ thường ("pass" | "violation" | "unsure") vì `eval.mjs`
  // yêu cầu chữ thường (khác với DB/API dùng chữ HOA).
  for (const v of result.verdicts) {
    predictions.push({
      solution: task.solutionId,
      constraint: v.constraintCode,
      verdict: v.verdict.toLowerCase() as PredictionRecord['verdict'],
      evidence: v.evidence
    });
  }

  for (const call of result.calls) {
    allCalls.push({ solution: task.solutionId, ...call });
  }

  if (result.calls.length > 0 && delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

export async function runCli(opts: CliOptions): Promise<{
  predictions: PredictionRecord[];
  calls: Array<ModelCallLog & { solution: string }>;
}> {
  const root = resolve(opts.datasetDir);
  const cfg = loadCheckerConfig();
  const { judge, delayMs, timeoutMs } = resolveRuntimeJudge(opts, cfg);
  const tasks = collectDatasetTasks(root);

  const predictions: PredictionRecord[] = [];
  const allCalls: Array<ModelCallLog & { solution: string }> = [];

  await tasks.reduce(
    (chain, task) =>
      chain.then(() =>
        runSingleTask(task, opts, judge, timeoutMs, delayMs, predictions, allCalls)
      ),
    Promise.resolve()
  );

  const outFile = resolve(opts.outPath);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(
    outFile,
    predictions.map((p) => JSON.stringify(p)).join('\n') + '\n',
    'utf8'
  );

  if (opts.callsOutPath) {
    const callsFile = resolve(opts.callsOutPath);
    mkdirSync(dirname(callsFile), { recursive: true });
    writeFileSync(
      callsFile,
      allCalls.map((c) => JSON.stringify(c)).join('\n') + '\n',
      'utf8'
    );
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
