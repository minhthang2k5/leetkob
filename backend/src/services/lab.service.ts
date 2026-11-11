import { LabStatus, ReviewVerdict, Role } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AuthenticatedUser } from '../types/auth';

export interface PublishResult {
  receipt: {
    labId: string;
    status: 'PUBLISHED';
    publishedAt: string;
  };
  isReplay: boolean;
}

export type PublishErrorType =
  'FORBIDDEN_ROLE' | 'LAB_NOT_FOUND' | 'FORBIDDEN_CLASS' | 'REVIEWS_PENDING';

export class PublishError extends Error {
  constructor(
    public readonly errorType: PublishErrorType,
    message: string,
    public readonly details?: { pendingCount?: number }
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export async function publishLab(
  labId: string,
  user: AuthenticatedUser
): Promise<PublishResult> {
  // Step 3: Global Role Validation (Prevent Information Disclosure)
  // Students are rejected BEFORE checking lab existence to prevent probing valid UUIDs
  if (user.role === Role.STUDENT) {
    throw new PublishError(
      'FORBIDDEN_ROLE',
      'Students do not have permission to publish lab marks.'
    );
  }

  // Step 4: Resource Existence
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: {
      class: {
        include: {
          tas: {
            where: { userId: user.id }
          }
        }
      }
    }
  });

  if (!lab) {
    throw new PublishError('LAB_NOT_FOUND', `Lab with ID ${labId} was not found.`);
  }

  // Step 5: Class Ownership & Tenancy
  if (user.role === Role.TA) {
    const isAssigned = lab.class.tas.length > 0;
    if (!isAssigned) {
      throw new PublishError(
        'FORBIDDEN_CLASS',
        'TA is not assigned to the class that owns this lab.'
      );
    }
  }

  // Step 6: Idempotency Check (Safe Replay)
  if (lab.status === LabStatus.PUBLISHED && lab.publishedAt) {
    return {
      receipt: {
        labId: lab.id,
        status: 'PUBLISHED',
        publishedAt: lab.publishedAt.toISOString()
      },
      isReplay: true
    };
  }

  // Step 7: Business Invariant (Required Reviews Check)
  const pendingCount = await prisma.submissionReview.count({
    where: {
      labId,
      isReviewed: false,
      OR: [
        { verdict: ReviewVerdict.VIOLATION },
        { verdict: ReviewVerdict.UNSURE },
        { isSampled: true }
      ]
    }
  });

  // DELIBERATE CONTRACT BREAK (PA2 evidence, never merge): the pending-review guard is off.
  // if (pendingCount > 0) {
  //   throw new PublishError(
  //     'REVIEWS_PENDING',
  //     `Lab ${labId} has ${pendingCount} required reviews pending.`,
  //     { pendingCount }
  //   );
  // }

  // Step 8: Atomic Publication
  // The transition is a single conditional UPDATE (compare-and-set on status = DRAFT).
  // Under concurrency PostgreSQL makes the second writer wait for the row lock, then
  // re-evaluates the WHERE clause against the committed row: it matches 0 rows, so
  // publishedAt is never overwritten and exactly one request performs the transition.
  const { publishedLab, transitioned } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.lab.updateMany({
      where: { id: labId, status: LabStatus.DRAFT },
      data: {
        status: LabStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });

    const current = await tx.lab.findUniqueOrThrow({ where: { id: labId } });
    return { publishedLab: current, transitioned: count === 1 };
  });

  return {
    receipt: {
      labId: publishedLab.id,
      status: 'PUBLISHED',
      publishedAt: publishedLab.publishedAt!.toISOString()
    },
    // The loser of a concurrent race gets the stored receipt, i.e. a replay.
    isReplay: !transitioned
  };
}
