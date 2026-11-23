import { Prisma, PrismaClient } from '@prisma/client';
import type { CheckInput, CheckResult, JudgeOutcome } from '@leetkob/shared';
import { isSampledPass } from './sampling';

export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 120000;

export interface Lease {
  submissionId: string;
  attempt: number;
}

export interface ClaimedJob extends Lease {
  labId: string;
  input: CheckInput;
  tests: { input: string; expectedOutput: string }[];
}

/** Only this repository touches Prisma; checker and judge receive no DB client or identity. */
export class SubmissionStore {
  constructor(readonly db: PrismaClient) {}

  async recoverExpired(): Promise<Lease[]> {
    return this.db.$queryRaw<Lease[]>`
      UPDATE submissions SET
        status = CASE WHEN attempts >= 3 THEN 'FAILED'::"SubmissionStatus" ELSE 'QUEUED'::"SubmissionStatus" END,
        "lockedAt" = NULL, "lastError" = 'LEASE_EXPIRED',
        "judgedAt" = CASE WHEN attempts >= 3 THEN clock_timestamp() ELSE NULL END
      WHERE id IN (
        SELECT id FROM submissions
        WHERE status = 'RUNNING' AND ("lockedAt" IS NULL OR "lockedAt" < clock_timestamp() - interval '2 minutes')
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id AS "submissionId", attempts AS attempt`;
  }

  async claim(): Promise<ClaimedJob | null> {
    return this.db.$transaction(async (tx) => {
      // Lock both job and lab briefly. At most one healthy RUNNING attempt per lab;
      // this also serializes cost snapshots without a long transaction around model calls.
      const rows = await tx.$queryRaw<{ id: string; labId: string }[]>`
        SELECT s.id, s."labId" FROM submissions s JOIN labs l ON l.id = s."labId"
        WHERE s.status = 'QUEUED' AND s.attempts < 3 AND l.status = 'DRAFT'
          AND NOT EXISTS (SELECT 1 FROM submissions active WHERE active."labId" = s."labId" AND active.status = 'RUNNING')
        ORDER BY s."createdAt", s.id LIMIT 1 FOR UPDATE OF l, s SKIP LOCKED`;
      if (!rows.length) return null;
      // A fresh READ COMMITTED snapshot after acquiring the lab lock closes the
      // window where another claimant committed during the SELECT above.
      if (
        await tx.submission.count({ where: { labId: rows[0].labId, status: 'RUNNING' } })
      )
        return null;
      await tx.$executeRaw`UPDATE submissions SET status = 'RUNNING', attempts = attempts + 1,
        "lockedAt" = clock_timestamp(), "lastError" = NULL WHERE id = ${rows[0].id}`;
      const job = await tx.submission.findUniqueOrThrow({
        where: { id: rows[0].id },
        select: {
          id: true,
          labId: true,
          attempts: true,
          code: true,
          lab: {
            select: {
              statement: true,
              tests: {
                orderBy: { position: 'asc' },
                select: { input: true, expectedOutput: true }
              },
              constraints: {
                orderBy: { code: 'asc' },
                select: { id: true, code: true, text: true }
              }
            }
          }
        }
      });
      return {
        submissionId: job.id,
        labId: job.labId,
        attempt: job.attempts,
        input: {
          code: job.code,
          statement: job.lab.statement,
          constraints: job.lab.constraints
        },
        tests: job.lab.tests
      };
    });
  }

  async heartbeat(lease: Lease): Promise<boolean> {
    const count = await this.db.$executeRaw`
      UPDATE submissions SET "lockedAt" = clock_timestamp()
      WHERE id = ${lease.submissionId} AND attempts = ${lease.attempt} AND status = 'RUNNING'
        AND "lockedAt" >= clock_timestamp() - interval '2 minutes'`;
    return count === 1;
  }

  async ownsLease(lease: Lease): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM submissions WHERE id = ${lease.submissionId} AND attempts = ${lease.attempt}
        AND status = 'RUNNING' AND "lockedAt" >= clock_timestamp() - interval '2 minutes'`;
    return rows.length === 1;
  }

  async labSpend(labId: string): Promise<number> {
    const total = await this.db.modelCall.aggregate({
      where: { submission: { labId } },
      _sum: { costUsd: true }
    });
    return total._sum.costUsd ?? 0;
  }

  async finish(
    lease: Lease,
    outcome: JudgeOutcome,
    checks: CheckResult,
    seed: string
  ): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      // Take the row lock before changing any child rows. Stale attempts write nothing.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM submissions WHERE id = ${lease.submissionId} AND attempts = ${lease.attempt}
          AND status = 'RUNNING' AND "lockedAt" >= clock_timestamp() - interval '2 minutes'
        FOR UPDATE`;
      if (!rows.length) return false;
      for (const verdict of checks.verdicts) {
        const key = {
          submissionId: lease.submissionId,
          constraintId: verdict.constraintId
        };
        const automatic = {
          verdict: verdict.verdict,
          source: verdict.source,
          evidence: verdict.evidence as unknown as Prisma.InputJsonValue,
          reason: verdict.reason,
          isSampled:
            verdict.verdict === 'PASS' &&
            isSampledPass(seed, lease.submissionId, verdict.constraintId)
        };
        await tx.constraintVerdict.upsert({
          where: { submissionId_constraintId: key },
          create: { ...key, ...automatic },
          update: {}
        });
        // Review may commit while the upsert waits for its row lock. Recheck the
        // review flag in the write itself, never with a read-then-update decision.
        await tx.constraintVerdict.updateMany({
          where: { ...key, isReviewed: false },
          data: automatic
        });
      }
      for (const call of checks.calls) {
        // Provider ids identify a response already recorded, not an instruction to call again.
        const recorded = call.requestId
          ? await tx.modelCall.findFirst({
              where: {
                submissionId: lease.submissionId,
                provider: call.provider,
                requestId: call.requestId
              }
            })
          : null;
        if (!recorded)
          await tx.modelCall.create({
            data: { submissionId: lease.submissionId, ...call }
          });
      }
      await tx.submission.update({
        where: { id: lease.submissionId },
        data: {
          ...outcome,
          status: 'JUDGED',
          judgedAt: new Date(),
          lockedAt: null,
          lastError: null
        }
      });
      return true;
    });
  }

  async fail(lease: Lease, reason: string): Promise<boolean> {
    // reason is a worker-owned code, never exception.message or student output.
    const result = await this.db.submission.updateMany({
      where: { id: lease.submissionId, attempts: lease.attempt, status: 'RUNNING' },
      data: {
        status: lease.attempt >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED',
        lockedAt: null,
        lastError: reason,
        judgedAt: lease.attempt >= MAX_ATTEMPTS ? new Date() : null
      }
    });
    return result.count === 1;
  }
}
