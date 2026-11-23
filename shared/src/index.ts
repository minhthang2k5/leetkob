/**
 * Types shared by every package. The specification is
 * docs/contract/pa3-interfaces.md, Part A; change that file first.
 *
 * This package holds types only, so other packages import it with `import type`.
 */

// ---------------------------------------------------------------- A.1 sandbox

export interface Limits {
  /** default 2 */
  cpuSeconds: number;
  /** default 5; past it the whole container is killed */
  wallSeconds: number;
  /** default 256; swap = memory (no extra swap) */
  memoryMb: number;
  /** default 64 */
  pids: number;
  /** default 64 * 1024 */
  outputBytes: number;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export type JudgeResult =
  | 'ACCEPTED'
  | 'WRONG_ANSWER'
  | 'TIME_LIMIT'
  | 'MEMORY_LIMIT'
  | 'RUNTIME_ERROR'
  | 'COMPILE_ERROR'
  | 'OUTPUT_LIMIT';

export interface JudgeOutcome {
  result: JudgeResult;
  testsPassed: number;
  testsTotal: number;
  /** at most 4 KB, only for COMPILE_ERROR */
  compileOutput: string | null;
  durationMs: number;
}

/** Returns an outcome for any fault of the submission; throws only on infrastructure failure. */
export type JudgeFn = (
  code: string,
  tests: TestCase[],
  limits?: Partial<Limits>
) => Promise<JudgeOutcome>;

// ---------------------------------------------------------------- A.2 checker

export type VerdictValue = 'PASS' | 'VIOLATION' | 'UNSURE';
export type VerdictSource = 'HARD_RULE' | 'MODEL' | 'GUARDRAIL';
export type ConstraintKind = 'BAN_LIST' | 'SEMANTIC';

export interface CheckConstraint {
  id: string;
  /** e.g. "C1" */
  code: string;
  text: string;
}

export interface CheckInput {
  statement: string;
  constraints: CheckConstraint[];
  /** the code as submitted; the checker removes comments and keeps line numbers */
  code: string;
}

export interface EvidenceLine {
  line: number;
  text: string;
}

export interface CheckVerdict {
  constraintId: string;
  constraintCode: string;
  verdict: VerdictValue;
  source: VerdictSource;
  evidence: EvidenceLine[];
  /** e.g. "timeout", "schema invalid", "evidence line 12 does not match" */
  reason: string | null;
}

export interface CheckOptions {
  /** MODEL_OFF=1: hard rules only, semantic constraints become UNSURE, no network */
  modelOff: boolean;
  /** required when modelOff is false */
  judge?: SemanticJudge;
  /** default 30_000 per model call */
  timeoutMs?: number;
}

export interface CheckResult {
  /** exactly one per constraint, in input order */
  verdicts: CheckVerdict[];
  /** empty when no model call was made */
  calls: ModelCallLog[];
}

export type CheckSubmissionFn = (
  input: CheckInput,
  opts: CheckOptions
) => Promise<CheckResult>;

/** Pure; the API uses it to fill Constraint.kind with the same rule as the checker. */
export type ClassifyConstraintFn = (text: string) => ConstraintKind;

// ---------------------------------------------------------------- A.3 model adapter

export interface SemanticRequest {
  statement: string;
  /** only semantic constraints a hard rule did not decide */
  constraints: CheckConstraint[];
  /** comments removed, line numbers kept */
  code: string;
}

export type ModelCallStatus = 'OK' | 'TIMEOUT' | 'API_ERROR';

export interface ModelCallLog {
  /** "anthropic" */
  provider: string;
  model: string;
  /** the provider's request id (required on the real dev-set run) */
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  costUsd: number;
  status: ModelCallStatus;
  /** the anonymised prompt */
  prompt: string;
}

export interface SemanticJudge {
  /** `raw` is not trusted; the checker validates it. */
  judge(
    req: SemanticRequest,
    opts: { timeoutMs: number }
  ): Promise<{ raw: unknown; call: ModelCallLog }>;
}

// ---------------------------------------------------------------- A.4 queue

export type SubmissionStatus = 'QUEUED' | 'RUNNING' | 'JUDGED' | 'FAILED';

/** The only payload of a job. The worker reads everything else from the DB. */
export interface JudgeJob {
  submissionId: string;
}
