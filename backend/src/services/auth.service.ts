import { createHash, randomBytes } from 'node:crypto';
import { Role } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { getDummyHash, verifyPassword } from '../utils/password';
import { AuthenticatedUser } from '../types/auth';

/** Contract B.3: a token expires 12 hours after login. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  name: string;
  username: string | null;
  role: Role;
}

export interface ClassSummary {
  id: string;
  code: string;
  name: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns null for an unknown username or a wrong password: the caller cannot tell which. */
export async function login(
  username: string,
  password: string,
  now: Date = new Date()
): Promise<{ token: string; user: PublicUser } | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, name: true, username: true, role: true, passwordHash: true }
  });

  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.passwordHash || !ok) return null;

  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS)
    }
  });

  const { passwordHash: _omit, ...publicUser } = user;
  return { token, user: publicUser };
}

/** The user behind a bearer token: a live session, or a PA#2 fixture token. */
export async function findUserByToken(
  token: string,
  now: Date = new Date()
): Promise<AuthenticatedUser | null> {
  const select = { id: true, name: true, role: true } as const;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, user: { select } }
  });
  if (session) return session.expiresAt > now ? session.user : null;

  return prisma.user.findUnique({ where: { token }, select });
}

export async function getMe(
  userId: string
): Promise<{ user: PublicUser; classes: ClassSummary[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, username: true, role: true }
  });

  const classSelect = { id: true, code: true, name: true } as const;
  const orderBy = { code: 'asc' } as const;
  let classes: ClassSummary[];
  if (user.role === Role.ADMIN) {
    classes = await prisma.class.findMany({ select: classSelect, orderBy });
  } else {
    const membership =
      user.role === Role.TA
        ? { tas: { some: { userId } } }
        : { students: { some: { userId } } };
    classes = await prisma.class.findMany({
      where: membership,
      select: classSelect,
      orderBy
    });
  }

  return { user, classes };
}
