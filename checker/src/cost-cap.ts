import type { CheckConstraint, CheckVerdict } from '@leetkob/shared';

/** Default per-lab spend cap in USD (brief, section 3; contract A.3 rule 4). */
export const DEFAULT_LAB_COST_CAP_USD = 3.0;

export function isLabCostCapReached(
  labSpentUsd: number | undefined,
  labCapUsd: number | undefined
): boolean {
  const spent = labSpentUsd ?? 0;
  const cap = labCapUsd ?? DEFAULT_LAB_COST_CAP_USD;
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
