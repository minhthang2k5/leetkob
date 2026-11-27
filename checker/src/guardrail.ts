import type {
  CheckConstraint,
  CheckVerdict,
  EvidenceLine,
  ModelCallLog,
  VerdictValue
} from '@leetkob/shared';

const VALID_VERDICTS = new Set<VerdictValue>(['PASS', 'VIOLATION', 'UNSURE']);

interface RawConstraintVerdict {
  constraintCode: string;
  verdict: VerdictValue;
  evidence: EvidenceLine[];
  reason?: string | null;
}

function guardrailUnsure(constraint: CheckConstraint, reason: string): CheckVerdict {
  return {
    constraintId: constraint.id,
    constraintCode: constraint.code,
    verdict: 'UNSURE',
    source: 'GUARDRAIL',
    evidence: [],
    reason
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRawVerdicts(raw: unknown): Map<string, RawConstraintVerdict> | null {
  if (!isPlainObject(raw) || !Array.isArray(raw.verdicts)) {
    return null;
  }

  const byCode = new Map<string, RawConstraintVerdict>();
  for (const item of raw.verdicts) {
    if (!isPlainObject(item)) return null;
    if (typeof item.constraintCode !== 'string' || !item.constraintCode) return null;
    if (
      typeof item.verdict !== 'string' ||
      !VALID_VERDICTS.has(item.verdict as VerdictValue)
    ) {
      return null;
    }
    if (!Array.isArray(item.evidence)) return null;

    const evidence: EvidenceLine[] = [];
    for (const ev of item.evidence) {
      if (
        !isPlainObject(ev) ||
        typeof ev.line !== 'number' ||
        !Number.isInteger(ev.line) ||
        typeof ev.text !== 'string'
      ) {
        return null;
      }
      evidence.push({ line: ev.line, text: ev.text });
    }

    if (
      item.reason !== undefined &&
      item.reason !== null &&
      typeof item.reason !== 'string'
    ) {
      return null;
    }

    byCode.set(item.constraintCode, {
      constraintCode: item.constraintCode,
      verdict: item.verdict as VerdictValue,
      evidence,
      reason: item.reason ?? null
    });
  }

  return byCode;
}

function verifyEvidenceLines(
  evidence: EvidenceLine[],
  originalLines: string[]
): string | null {
  for (const ev of evidence) {
    if (ev.line < 1 || ev.line > originalLines.length) {
      return `evidence line ${ev.line} does not match`;
    }
    const actual = originalLines[ev.line - 1].trim();
    const claimed = ev.text.trim();
    if (!claimed || actual !== claimed) {
      return `evidence line ${ev.line} does not match`;
    }
  }
  return null;
}

/**
 * Applies guardrails to the untrusted output of `SemanticJudge`:
 * 1. Timeout / API error -> UNSURE (GUARDRAIL)
 * 2. Schema validation -> UNSURE (GUARDRAIL, "schema invalid")
 * 3. Exact 1-based evidence line check against original submitted code
 *
 * Nguyên tắc nghiệp vụ: Phạt nhầm sinh viên (wrongful deduction) là lỗi nặng nhất.
 * Nếu model trả kết quả không đáng tin cậy ở bất kỳ bước nào, chuyển về `UNSURE`
 * để đẩy lên hàng đợi cho TA duyệt tay (Human Gate).
 */
export function applyGuardrails(
  constraints: CheckConstraint[],
  raw: unknown,
  call: ModelCallLog,
  originalLines: string[]
): CheckVerdict[] {
  // 1. Mạng lỗi hoặc quá timeout -> không đoán bừa, ép toàn bộ sang UNSURE.
  if (call.status === 'TIMEOUT') {
    return constraints.map((c) => guardrailUnsure(c, 'timeout'));
  }
  if (call.status === 'API_ERROR') {
    return constraints.map((c) => guardrailUnsure(c, 'api error'));
  }

  // 2. Kiểm tra cấu trúc JSON trả về có đúng schema hợp đồng hay không.
  const parsed = parseRawVerdicts(raw);
  if (!parsed) {
    return constraints.map((c) => guardrailUnsure(c, 'schema invalid'));
  }

  return constraints.map((constraint) => {
    const item = parsed.get(constraint.code);
    if (!item) {
      return guardrailUnsure(constraint, 'schema invalid');
    }

    // 3. Chống AI "bịa" dòng code (hallucination): từng dòng `evidence` phải
    // tồn tại và khớp nguyên văn (sau khi trim) với bài nộp gốc của sinh viên.
    const mismatchReason = verifyEvidenceLines(item.evidence, originalLines);
    if (mismatchReason) {
      return guardrailUnsure(constraint, mismatchReason);
    }

    return {
      constraintId: constraint.id,
      constraintCode: constraint.code,
      verdict: item.verdict,
      source: 'MODEL',
      evidence: item.evidence.map((ev) => ({
        line: ev.line,
        text: originalLines[ev.line - 1].trim()
      })),
      reason: item.reason ?? null
    };
  });
}
