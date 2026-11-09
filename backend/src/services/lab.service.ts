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
  | 'FORBIDDEN_ROLE'
  | 'LAB_NOT_FOUND'
  | 'FORBIDDEN_CLASS'
  | 'REVIEWS_PENDING';

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

  if (pendingCount > 0) {
    throw new PublishError(
      'REVIEWS_PENDING',
      `Lab ${labId} has ${pendingCount} required reviews pending.`,
      { pendingCount }
    );
  }

  // Step 8: Atomic Publication
  const publishedLab = await prisma.$transaction(async (tx) => {
    // Re-check inside transaction for concurrency safety (CT-12)
    const current = await tx.lab.findUniqueOrThrow({
      where: { id: labId }
    });

    if (current.status === LabStatus.PUBLISHED && current.publishedAt) {
      return current;
    }

    return tx.lab.update({
      where: { id: labId },
      data: {
        status: LabStatus.PUBLISHED,
        publishedAt: new Date()
      }
    });
  });

  return {
    receipt: {
      labId: publishedLab.id,
      status: 'PUBLISHED',
      publishedAt: publishedLab.publishedAt!.toISOString()
    },
    isReplay: false
  };
}

