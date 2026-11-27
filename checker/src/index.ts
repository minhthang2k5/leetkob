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
  // Tầng 1 (Tiền xử lý): Xóa comment để vừa ẩn danh (tránh lộ tên/MSSV), vừa chặn
  // prompt injection trong comment, đồng thời giữ nguyên số dòng 1-based.
  const strippedCode = stripCommentsKeepLines(input.code);
  // Tách code gốc theo từng dòng để lát nữa đối chiếu `evidence` (phải khớp bài nộp gốc).
  const originalLines = splitLines(input.code);

  // Tầng 2 (Phân loại): Tách ràng buộc thành 2 nhóm:
  // - BAN_LIST ("Do not use/call `...`"): kiểm tra bằng AST (miễn phí, chính xác 100%).
  // - SEMANTIC (ràng buộc thuật toán/ngữ nghĩa): chỉ gửi model nếu thực sự cần.
  const banConstraints: CheckConstraint[] = [];
  const semanticConstraints: CheckConstraint[] = [];

  for (const constraint of input.constraints) {
    if (classifyConstraint(constraint.text) === 'BAN_LIST') {
      banConstraints.push(constraint);
    } else {
      semanticConstraints.push(constraint);
    }
  }

  // Chạy Hard Rules trước cho toàn bộ BAN_LIST (chỉ parse AST C++ đúng 1 lần).
  const verdictById = new Map<string, CheckVerdict>();
  const hardVerdicts = await evaluateHardRules(banConstraints, input.code, strippedCode);
  for (const v of hardVerdicts) {
    verdictById.set(v.constraintId, v);
  }

  const calls: ModelCallLog[] = [];

  // Tầng 3 (Model + Guardrail): Chỉ gọi AI khi còn ít nhất 1 ràng buộc SEMANTIC.
  // Nếu bài chỉ có BAN_LIST -> trả kết quả ngay, không tốn tiền gọi model.
  if (semanticConstraints.length > 0) {
    if (opts.modelOff) {
      // Chế độ offline (CI / test không mạng): mọi ràng buộc SEMANTIC -> UNSURE để TA tự duyệt.
      for (const v of modelOffUnsureVerdicts(semanticConstraints)) {
        verdictById.set(v.constraintId, v);
      }
    } else if (isLabCostCapReached(opts.labSpentUsd, opts.labCapUsd)) {
      // Đã chạm trần chi phí của lab (mặc định $3) -> ngừng gọi model để tránh đội ngân sách.
      for (const v of costCapUnsureVerdicts(semanticConstraints)) {
        verdictById.set(v.constraintId, v);
      }
    } else {
      if (!opts.judge) {
        throw new Error('SemanticJudge is required when modelOff is false');
      }
      const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      // Gom tất cả ràng buộc SEMANTIC vào ĐÚNG 1 lần gọi model/bài (kèm code đã xóa comment).
      const req = {
        statement: input.statement,
        constraints: semanticConstraints,
        code: strippedCode
      };

      const raced = await runWithTimeout(opts.judge.judge(req, { timeoutMs }), timeoutMs);

      let semanticVerdicts: CheckVerdict[];
      if (raced.timedOut) {
        // Quá thời gian chờ -> tạo log TIMEOUT rồi qua guardrail ép toàn bộ sang UNSURE.
        const timeoutCall: ModelCallLog = {
          provider:
            opts.judge instanceof FakeJudge
              ? 'fake'
              : opts.judge instanceof GeminiJudge
                ? 'gemini'
                : 'anthropic',
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
        // Không tin kết quả thô từ AI: luôn đưa qua `applyGuardrails` kiểm tra schema + khớp dòng.
        const { raw, call } = raced.value;
        calls.push(call);
        semanticVerdicts = applyGuardrails(semanticConstraints, raw, call, originalLines);
      }

      for (const v of semanticVerdicts) {
        verdictById.set(v.constraintId, v);
      }
    }
  }

  // Ghép kết quả theo ĐÚNG thứ tự `input.constraints` ban đầu (hợp đồng A.2).
  const verdicts = input.constraints.map((c) => {
    const v = verdictById.get(c.id);
    if (!v) {
      throw new Error(`Missing verdict for constraint ${c.id}`);
    }
    return v;
  });

  return { verdicts, calls };
}
