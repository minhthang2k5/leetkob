import type {
  CheckConstraint,
  CheckInput,
  CheckOptions,
  CheckResult,
  CheckVerdict,
  ModelCallLog,
  SemanticJudge
} from '@leetkob/shared';
import { classifyConstraint } from './classify';
import { loadCheckerConfig } from './config';
import { costCapUnsureVerdicts, isLabCostCapReached } from './cost-cap';
import { FakeJudge } from './fake-judge';
import { GeminiJudge } from './gemini-judge';
import { applyGuardrails } from './guardrail';
import { evaluateHardRules } from './hard-rules';
import { splitLines, stripCommentsKeepLines } from './preprocess';

export {
  AnthropicJudge,
  buildAnonymizedPrompt,
  calculateCostUsd,
  DEFAULT_ANTHROPIC_MODEL
} from './anthropic-judge';
export type {
  AnthropicClientLike,
  AnthropicJudgeOptions,
  AnthropicMessagesResponse
} from './anthropic-judge';
export {
  calculateGeminiCostUsd,
  DEFAULT_GEMINI_MODEL,
  GeminiJudge
} from './gemini-judge';
export type { FetchLike, GeminiApiResponse, GeminiJudgeOptions } from './gemini-judge';
export { bannedNames, classifyConstraint } from './classify';
export {
  DEFAULT_LAB_COST_CAP_USD,
  DEFAULT_TIMEOUT_MS,
  loadCheckerConfig
} from './config';
export type { CheckerConfig, CheckerProvider } from './config';
export { FakeJudge } from './fake-judge';
export type { FakeJudgeMode, FakeJudgeOptions } from './fake-judge';
export { applyGuardrails } from './guardrail';
export { checkHardRule, evaluateHardRules } from './hard-rules';
export { splitLines, stripCommentsKeepLines } from './preprocess';

export interface ExtendedCheckOptions extends CheckOptions {
  /** Sum of persisted ModelCall.costUsd for this lab so far. */
  labSpentUsd?: number;
  /** Configured per-lab cap in USD (defaults to DEFAULT_LAB_COST_CAP_USD). */
  labCapUsd?: number;
}

function modelOffUnsureVerdicts(constraints: CheckConstraint[]): CheckVerdict[] {
  return constraints.map((c) => ({
    constraintId: c.id,
    constraintCode: c.code,
    verdict: 'UNSURE',
    source: 'GUARDRAIL',
    evidence: [],
    reason: 'model off'
  }));
}

function resolveJudgeProvider(judge: SemanticJudge): string {
  if (judge instanceof FakeJudge) return 'fake';
  if (judge instanceof GeminiJudge) return 'gemini';
  return 'anthropic';
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    });
    const workPromise = promise.then((value) => ({ timedOut: false as const, value }));
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function evaluateSemanticConstraints(
  statement: string,
  semanticConstraints: CheckConstraint[],
  strippedCode: string,
  originalLines: string[],
  opts: ExtendedCheckOptions
): Promise<{ verdicts: CheckVerdict[]; calls: ModelCallLog[] }> {
  if (opts.modelOff) {
    return { verdicts: modelOffUnsureVerdicts(semanticConstraints), calls: [] };
  }
  if (isLabCostCapReached(opts.labSpentUsd, opts.labCapUsd)) {
    return { verdicts: costCapUnsureVerdicts(semanticConstraints), calls: [] };
  }
  if (!opts.judge) {
    throw new Error('SemanticJudge is required when modelOff is false');
  }

  const timeoutMs = opts.timeoutMs ?? loadCheckerConfig().timeoutMs;
  const req = { statement, constraints: semanticConstraints, code: strippedCode };
  const raced = await runWithTimeout(opts.judge.judge(req, { timeoutMs }), timeoutMs);

  if (raced.timedOut) {
    const timeoutCall: ModelCallLog = {
      provider: resolveJudgeProvider(opts.judge),
      model: 'unknown',
      requestId: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: timeoutMs,
      costUsd: 0,
      status: 'TIMEOUT',
      prompt: ''
    };
    return {
      verdicts: applyGuardrails(semanticConstraints, null, timeoutCall, originalLines),
      calls: [timeoutCall]
    };
  }

  const { raw, call } = raced.value;
  return {
    verdicts: applyGuardrails(semanticConstraints, raw, call, originalLines),
    calls: [call]
  };
}

/**
 * Checks an Accepted C++ submission against all declared constraints:
 * 1. Strips comments while preserving 1-based line numbers.
 * 2. Splits constraints into `BAN_LIST` (AST hard rules) and `SEMANTIC`.
 * 3. Runs AST hard rules first; if no semantic constraints remain, returns immediately.
 * 4. Checks `modelOff` (`MODEL_OFF=1`) and per-lab cost cap before calling the model.
 * 5. Calls `SemanticJudge` at most once per submission and validates output via guardrails.
 */
export async function checkSubmission(
  input: CheckInput,
  opts: ExtendedCheckOptions
): Promise<CheckResult> {
  const strippedCode = stripCommentsKeepLines(input.code);
  const originalLines = splitLines(input.code);

  const banConstraints: CheckConstraint[] = [];
  const semanticConstraints: CheckConstraint[] = [];
  for (const constraint of input.constraints) {
    if (classifyConstraint(constraint.text) === 'BAN_LIST') {
      banConstraints.push(constraint);
    } else {
      semanticConstraints.push(constraint);
    }
  }

  const verdictById = new Map<string, CheckVerdict>();
  const hardVerdicts = await evaluateHardRules(banConstraints, input.code, strippedCode);
  for (const v of hardVerdicts) {
    verdictById.set(v.constraintId, v);
  }

  const calls: ModelCallLog[] = [];
  if (semanticConstraints.length > 0) {
    const sem = await evaluateSemanticConstraints(
      input.statement,
      semanticConstraints,
      strippedCode,
      originalLines,
      opts
    );
    calls.push(...sem.calls);
    for (const v of sem.verdicts) {
      verdictById.set(v.constraintId, v);
    }
  }

  const verdicts = input.constraints.map((c) => {
    const v = verdictById.get(c.id);
    if (!v) {
      throw new Error(`Missing verdict for constraint ${c.id}`);
    }
    return v;
  });

  return { verdicts, calls };
}
