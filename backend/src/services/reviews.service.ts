import { Constraint, ConstraintVerdict, LabStatus, ReviewVerdict } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/api-error';
import { AuthenticatedUser } from '../types/auth';
import { Decision } from '../validation/lab.validation';
import { getClassAccess, requireLabAccess } from './access.service';
import { pendingReviewWhere } from './lab.service';
import { toSubmission } from './submissions.service';

type VerdictWithConstraint = ConstraintVerdict & { constraint: Constraint };

/** Contract B.6: computed, never stored. */
export function requiresReview(v: ConstraintVerdict): boolean {
  return v.verdict !== ReviewVerdict.PASS || v.isSampled;
}

export function toVerdict(v: VerdictWithConstraint) {
  return {
    id: v.id,
    constraintId: v.constraintId,
    constraintCode: v.constraint.code,
    constraintText: v.constraint.text,
    deduction: v.constraint.deduction,
    verdict: v.verdict,
    source: v.source,
    evidence: v.evidence,
    reason: v.reason,
    requiresReview: requiresReview(v),
    isSampled: v.isSampled,
    isReviewed: v.isReviewed,
    decision: v.decision,
    reviewNote: v.reviewNote
  };
}

const byConstraintCode = (a: VerdictWithConstraint, b: VerdictWithConstraint) =>
  a.constraint.code.localeCompare(b.constraint.code, 'en', { numeric: true });

export async function getReviewQueue(user: AuthenticatedUser, labId: string) {
  const { lab, access } = await requireLabAccess(user, labId);
  if (!access.isStaff) {
    throw new ApiError(
      'FORBIDDEN',
      'Only a TA of this class or an admin sees the review queue.'
    );
  }

  const [submissions, pendingCount] = await Promise.all([
    prisma.submission.findMany({
      where: { labId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { name: true } },
        verdicts: { include: { constraint: true } }
      }
    }),
    prisma.constraintVerdict.count({ where: pendingReviewWhere(labId) })
  ]);

  return {
    labId,
    labStatus: lab.status,
    pendingCount,
    items: submissions.map((s) => ({
      submission: toSubmission(s, true),
      // As submitted, comments included: the TA reads what the student wrote.
      code: s.code,
      verdicts: [...s.verdicts].sort(byConstraintCode).map(toVerdict)
    }))
  };
}

export async function reviewVerdict(
  user: AuthenticatedUser,
  verdictId: string,
  input: { decision: Decision; note: string | null },
  now: Date = new Date()
) {
  const found = await prisma.constraintVerdict.findUnique({
    where: { id: verdictId },
    select: { submission: { select: { lab: { select: { classId: true } } } } }
  });
  if (!found) {
    throw new ApiError('VERDICT_NOT_FOUND', `Verdict ${verdictId} was not found.`);
  }

  const access = await getClassAccess(user, found.submission.lab.classId);
  if (!access.isStaff) {
    throw new ApiError('FORBIDDEN', 'Only a TA of this class or an admin can review.');
  }

  // Compare-and-set (AGENTS.md): the write happens only while the lab is still DRAFT,
  // in the same statement, so a review can never land after publish.
  const { count } = await prisma.constraintVerdict.updateMany({
    where: { id: verdictId, submission: { lab: { status: LabStatus.DRAFT } } },
    data: {
      isReviewed: true,
      decision: input.decision,
      reviewNote: input.note,
      reviewedById: user.id,
      reviewedAt: now
    }
  });
  if (count === 0) {
    throw new ApiError('LAB_PUBLISHED', 'The lab is published; its reviews are final.');
  }

  const updated = await prisma.constraintVerdict.findUniqueOrThrow({
    where: { id: verdictId },
    include: { constraint: true }
  });
  return toVerdict(updated);
}
