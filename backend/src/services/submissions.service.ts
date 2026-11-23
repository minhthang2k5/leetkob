import { LabStatus, Role, Submission } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/api-error';
import { AuthenticatedUser } from '../types/auth';
import { getClassAccess, requireLabAccess } from './access.service';

/** Contract B.5: at most 5 submissions per student per lab in a sliding 10 minutes. */
export const SUBMISSION_LIMIT = 5;
export const SUBMISSION_WINDOW_MS = 10 * 60 * 1000;

type WithStudent = Submission & { student: { name: string } };

/**
 * Contract B.5. `studentName` only for staff. Never any verdict or deduction: those
 * reach a student only after publish, through another route.
 */
export function toSubmission(s: WithStudent, isStaff: boolean) {
  return {
    id: s.id,
    labId: s.labId,
    ...(isStaff ? { studentName: s.student.name } : {}),
    createdAt: s.createdAt.toISOString(),
    judgedAt: s.judgedAt?.toISOString() ?? null,
    status: s.status,
    result: s.result,
    testsPassed: s.testsPassed,
    testsTotal: s.testsTotal,
    compileOutput: s.compileOutput
  };
}

const includeStudent = { student: { select: { name: true } } } as const;

export async function submit(
  user: AuthenticatedUser,
  labId: string,
  code: string,
  now: Date = new Date()
) {
  const { lab, access } = await requireLabAccess(user, labId);
  if (!access.isEnrolledStudent) {
    throw new ApiError('FORBIDDEN', 'Only a student enrolled in this class can submit.');
  }
  if (lab.status === LabStatus.PUBLISHED) {
    throw new ApiError(
      'LAB_PUBLISHED',
      'This lab is published and takes no more submissions.'
    );
  }

  return prisma.$transaction(async (tx) => {
    // One lock per (student, lab) for the rest of this transaction: two requests at the
    // same moment are counted one after the other, so both cannot pass the limit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}:${labId}`}))`;

    const since = new Date(now.getTime() - SUBMISSION_WINDOW_MS);
    const recent = await tx.submission.findMany({
      where: { labId, studentId: user.id, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });
    if (recent.length >= SUBMISSION_LIMIT) {
      const freesAt =
        recent[recent.length - SUBMISSION_LIMIT].createdAt.getTime() +
        SUBMISSION_WINDOW_MS;
      const retryAfter = Math.max(1, Math.ceil((freesAt - now.getTime()) / 1000));
      throw new ApiError(
        'RATE_LIMITED',
        `At most ${SUBMISSION_LIMIT} submissions per ${SUBMISSION_WINDOW_MS / 60000} minutes for one lab.`,
        { headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // QUEUED is the job: the worker picks it up (contract A.4). Nothing is judged here.
    const created = await tx.submission.create({
      data: { labId, studentId: user.id, code, createdAt: now },
      include: includeStudent
    });
    return toSubmission(created, false);
  });
}

export async function listSubmissions(user: AuthenticatedUser, labId: string) {
  const { access } = await requireLabAccess(user, labId);
  const rows = await prisma.submission.findMany({
    where: { labId, ...(access.isStaff ? {} : { studentId: user.id }) },
    orderBy: { createdAt: 'desc' },
    include: includeStudent
  });
  return rows.map((s) => toSubmission(s, access.isStaff));
}

export async function getSubmission(user: AuthenticatedUser, submissionId: string) {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { ...includeStudent, lab: { select: { classId: true } } }
  });
  const notFound = new ApiError(
    'SUBMISSION_NOT_FOUND',
    `Submission ${submissionId} was not found.`
  );
  if (!s) throw notFound;

  if (user.role === Role.STUDENT) {
    // Another student's submission looks exactly like a missing one (contract B.5).
    if (s.studentId !== user.id) throw notFound;
    return toSubmission(s, false);
  }

  const access = await getClassAccess(user, s.lab.classId);
  if (!access.isStaff) {
    throw new ApiError(
      'FORBIDDEN',
      'You are not a TA of the class that owns this submission.'
    );
  }
  return toSubmission(s, true);
}
