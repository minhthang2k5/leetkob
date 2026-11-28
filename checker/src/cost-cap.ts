import type { CheckConstraint, CheckVerdict } from '@leetkob/shared';
import { DEFAULT_LAB_COST_CAP_USD, loadCheckerConfig } from './config';

export { DEFAULT_LAB_COST_CAP_USD } from './config';

/**
 * Kiểm tra tổng chi phí đã dùng của cả lab (do worker cộng dồn từ DB) có chạm trần chưa.
 * Ưu tiên `labCapUsd` truyền vào -> biến môi trường `CHECKER_LAB_COST_CAP_USD` -> mặc định $3.0.
 */
export function isLabCostCapReached(
  labSpentUsd: number | undefined,
  labCapUsd: number | undefined
): boolean {
  const spent = labSpentUsd ?? 0;
  const cap = labCapUsd ?? loadCheckerConfig().labCapUsd ?? DEFAULT_LAB_COST_CAP_USD;
  return spent >= cap;
}

export function costCapUnsureVerdicts(constraints: CheckConstraint[]): CheckVerdict[] {
  return constraints.map((constraint) => ({
    constraintId: constraint.id,
    constraintCode: constraint.code,
    verdict: 'UNSURE',
    source: 'GUARDRAIL',
    evidence: [],
    reason: 'lab cost cap reached'
  }));
}
