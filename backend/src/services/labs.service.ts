import { Constraint, Lab, TestCase } from '@prisma/client';
import { classifyConstraint } from '@leetkob/checker';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/api-error';
import { AuthenticatedUser } from '../types/auth';
import { NewLab } from '../validation/lab.validation';
import { requireClassAccess, requireLabAccess } from './access.service';

// Response shapes of contract B.4.

export function toLabSummary(lab: Lab) {
  return {
    id: lab.id,
    classId: lab.classId,
    title: lab.title,
    status: lab.status,
    publishedAt: lab.publishedAt?.toISOString() ?? null,
    createdAt: lab.createdAt.toISOString()
  };
}

/**
 * Staff (TA of the class, admin) see everything. A student gets `tests: []` and
 * constraints without `deduction`: hidden tests and marks stay on the server.
 */
export function toLab(
  lab: Lab & { tests: TestCase[]; constraints: Constraint[] },
  isStaff: boolean
) {
  return {
    ...toLabSummary(lab),
    statement: lab.statement,
    tests: isStaff
      ? lab.tests.map((t) => ({ input: t.input, expectedOutput: t.expectedOutput }))
      : [],
    // C1, C2, ..., C10: numeric order, not string order.
    constraints: [...lab.constraints].sort(byCode).map((c) => ({
      id: c.id,
      code: c.code,
      text: c.text,
      kind: c.kind,
      ...(isStaff ? { deduction: c.deduction } : {})
    }))
  };
}

function byCode(a: Constraint, b: Constraint): number {
  return a.code.localeCompare(b.code, 'en', { numeric: true });
}

const withDetails = {
  tests: { orderBy: { position: 'asc' } },
  constraints: true
} as const;

export async function listLabs(user: AuthenticatedUser, classId: string) {
  await requireClassAccess(user, classId);
  const labs = await prisma.lab.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' }
  });
  return labs.map(toLabSummary);
}

export async function createLab(user: AuthenticatedUser, classId: string, input: NewLab) {
  const access = await requireClassAccess(user, classId);
  if (!access.isStaff) {
    throw new ApiError(
      'FORBIDDEN',
      'Only a TA of this class or an admin can create labs.'
    );
  }

  const lab = await prisma.lab.create({
    data: {
      classId,
      title: input.title,
      statement: input.statement,
      tests: {
        create: input.tests.map((t, position) => ({ position, ...t }))
      },
      constraints: {
        // The server decides the kind with the checker's own rule (contract A.2).
        create: input.constraints.map((c) => ({ ...c, kind: classifyConstraint(c.text) }))
      }
    },
    include: withDetails
  });
  return toLab(lab, true);
}

export async function getLab(user: AuthenticatedUser, labId: string) {
  const { access } = await requireLabAccess(user, labId);
  const lab = await prisma.lab.findUniqueOrThrow({
    where: { id: labId },
    include: withDetails
  });
  return toLab(lab, access.isStaff);
}
