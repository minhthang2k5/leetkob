import type {
  CheckConstraint,
  CheckInput,
  CheckOptions,
  CheckResult,
  CheckVerdict,
  ModelCallLog
} from '@leetkob/shared';
import { classifyConstraint } from './classify';
import { costCapUnsureVerdicts, isLabCostCapReached } from './cost-cap';
import { FakeJudge } from './fake-judge';
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
export { bannedNames, classifyConstraint } from './classify';
export { DEFAULT_LAB_COST_CAP_USD } from './cost-cap';
export { FakeJudge } from './fake-judge';
export type { FakeJudgeMode, FakeJudgeOptions } from './fake-judge';
export { applyGuardrails } from './guardrail';
export { checkHardRule, evaluateHardRules } from './hard-rules';
export { splitLines, stripCommentsKeepLines } from './preprocess';

const DEFAULT_TIMEOUT_MS = 30_000;

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
    if (opts.modelOff) {
      for (const v of modelOffUnsureVerdicts(semanticConstraints)) {
        verdictById.set(v.constraintId, v);
      }
    } else if (isLabCostCapReached(opts.labSpentUsd, opts.labCapUsd)) {
      for (const v of costCapUnsureVerdicts(semanticConstraints)) {
        verdictById.set(v.constraintId, v);
      }
    } else {
      if (!opts.judge) {
        throw new Error('SemanticJudge is required when modelOff is false');
      }
      const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const req = {
        statement: input.statement,
        constraints: semanticConstraints,
        code: strippedCode
      };

      const raced = await runWithTimeout(opts.judge.judge(req, { timeoutMs }), timeoutMs);

      let semanticVerdicts: CheckVerdict[];
      if (raced.timedOut) {
        const timeoutCall: ModelCallLog = {
          provider: opts.judge instanceof FakeJudge ? 'fake' : 'anthropic',
          model: 'unknown',
          requestId: null,
          inputTokens: 0,
          outputTokens: 0,
          ms: timeoutMs,
          costUsd: 0,
          status: 'TIMEOUT',
          prompt: ''
        };
        calls.push(timeoutCall);
        semanticVerdicts = applyGuardrails(
          semanticConstraints,
          null,
          timeoutCall,
          originalLines
        );
      } else {
        const { raw, call } = raced.value;
        calls.push(call);
        semanticVerdicts = applyGuardrails(semanticConstraints, raw, call, originalLines);
      }

      for (const v of semanticVerdicts) {
        verdictById.set(v.constraintId, v);
      }
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
