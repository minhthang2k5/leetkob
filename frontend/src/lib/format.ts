import type {
  JudgeResult,
  ReviewDecision,
  Role,
  SubmissionStatus,
  VerdictSource,
  VerdictValue
} from '../api';

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Quản trị',
  TA: 'Trợ giảng',
  STUDENT: 'Sinh viên'
};

export const statusLabel: Record<SubmissionStatus, string> = {
  QUEUED: 'Đang chờ chấm',
  RUNNING: 'Đang chấm',
  JUDGED: 'Đã chấm',
  FAILED: 'Lỗi hệ thống'
};

export const resultLabel: Record<JudgeResult, string> = {
  ACCEPTED: 'Accepted',
  WRONG_ANSWER: 'Sai kết quả',
  TIME_LIMIT: 'Quá thời gian',
  MEMORY_LIMIT: 'Quá bộ nhớ',
  RUNTIME_ERROR: 'Lỗi khi chạy',
  COMPILE_ERROR: 'Lỗi biên dịch',
  OUTPUT_LIMIT: 'Output quá dài'
};

export const verdictLabel: Record<VerdictValue, string> = {
  PASS: 'Đạt',
  VIOLATION: 'Vi phạm',
  UNSURE: 'Chưa chắc'
};

export const sourceLabel: Record<VerdictSource, string> = {
  HARD_RULE: 'Luật cứng',
  MODEL: 'Model',
  GUARDRAIL: 'Guardrail'
};

export const decisionLabel: Record<ReviewDecision, string> = {
  CONFIRMED: 'Giữ nguyên',
  OVERRIDDEN_PASS: 'Đổi thành đạt',
  OVERRIDDEN_VIOLATION: 'Đổi thành vi phạm'
};

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

export function formatTime(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '';
}

/** The deduction a verdict leads to after review. Only the TA's decision counts. */
export function effectiveDeduction(v: {
  verdict: VerdictValue;
  decision: ReviewDecision | null;
  deduction: number;
}): number {
  if (v.decision === 'OVERRIDDEN_PASS') return 0;
  if (v.decision === 'OVERRIDDEN_VIOLATION') return v.deduction;
  return v.verdict === 'VIOLATION' ? v.deduction : 0;
}
