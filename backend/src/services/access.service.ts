import { Role } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/api-error';
import { AuthenticatedUser } from '../types/auth';

/** What a user may do in one class. Every permission check goes through here. */
export interface ClassAccess {
  /** may read the class's labs */
  canRead: boolean;
  /** TA of the class or admin: may create labs, see tests, deductions and all submissions */
  isStaff: boolean;
  /** student enrolled in the class: may submit */
  isEnrolledStudent: boolean;
}

export async function getClassAccess(
  user: AuthenticatedUser,
  classId: string
): Promise<ClassAccess> {
  if (user.role === Role.ADMIN) {
    return { canRead: true, isStaff: true, isEnrolledStudent: false };
  }
  if (user.role === Role.TA) {
    const ta = await prisma.classTA.findUnique({
      where: { classId_userId: { classId, userId: user.id } }
    });
    return { canRead: !!ta, isStaff: !!ta, isEnrolledStudent: false };
  }
  const enrolment = await prisma.classStudent.findUnique({
    where: { classId_userId: { classId, userId: user.id } }
  });
  return { canRead: !!enrolment, isStaff: false, isEnrolledStudent: !!enrolment };
}

/** 404 when the class does not exist, then 403 when the user may not read it (contract B.4). */
export async function requireClassAccess(
  user: AuthenticatedUser,
  classId: string
): Promise<ClassAccess> {
  const exists = await prisma.class.findUnique({
    where: { id: classId },
    select: { id: true }
  });
  if (!exists) throw new ApiError('CLASS_NOT_FOUND', `Class ${classId} was not found.`);

  const access = await getClassAccess(user, classId);
  if (!access.canRead) {
    throw new ApiError('FORBIDDEN', 'You are not a member of this class.');
  }
  return access;
}

/** 404 when the lab does not exist, then 403 when the user may not read its class. */
export async function requireLabAccess(user: AuthenticatedUser, labId: string) {
  const lab = await prisma.lab.findUnique({ where: { id: labId } });
  if (!lab) throw new ApiError('NOT_FOUND', `Lab with ID ${labId} was not found.`);

  const access = await getClassAccess(user, lab.classId);
  if (!access.canRead) {
    throw new ApiError(
      'FORBIDDEN',
      'You are not a member of the class that owns this lab.'
    );
  }
  return { lab, access };
}
