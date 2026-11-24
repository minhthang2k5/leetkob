#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CheckConstraint, ModelCallLog, SemanticJudge } from '@leetkob/shared';
import { AnthropicJudge } from './anthropic-judge';
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
  modelOff: boolean;
  timeoutMs?: number;
  judge?: SemanticJudge;
}

export interface PredictionRecord {
  solution: string;
  constraint: string;
  verdict: 'pass' | 'violation' | 'unsure';
  evidence: Array<{ line: number; text: string }>;
}

export function parseCliArgs(argv: string[]): CliOptions {
  let datasetDir: string | undefined;
  let outPath: string | undefined;
  let callsOutPath: string | undefined;
  let modelOff = process.env.MODEL_OFF === '1';
  let timeoutMs: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') {
      outPath = argv[++i];
    } else if (arg === '--data') {
      datasetDir = argv[++i];
    } else if (arg === '--calls-out') {
      callsOutPath = argv[++i];
    } else if (arg === '--timeout-ms') {
      timeoutMs = Number(argv[++i]);
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
      'Usage: leetcob-checker <dataset_dir> --out <predictions.jsonl> [--calls-out <calls.jsonl>] [--model-off]'
    );
  }

  return { datasetDir, outPath, callsOutPath, modelOff, timeoutMs };
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

  const judge = opts.modelOff ? undefined : (opts.judge ?? new AnthropicJudge());
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
      const result = await checkSubmission(
        { statement, constraints, code },
        {
          modelOff: opts.modelOff,
          judge,
          timeoutMs: opts.timeoutMs
        }
      );

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
