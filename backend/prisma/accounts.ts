import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

/**
 * The test accounts of the deployment (contract B.3): 1 admin, 2 TAs of two classes,
 * 2 students of the first TA's class. Passwords come from the environment, never from git.
 * Safe to run again: it updates the accounts in place and signs out their old sessions.
 *
 *   npm run db:seed:accounts -w backend
 */
export const ACCOUNT_CLASSES = {
  first: { code: 'CSC13114-01', name: 'C++ Programming, class 01' },
  second: { code: 'CSC13114-02', name: 'C++ Programming, class 02' }
} as const;

type ClassKey = keyof typeof ACCOUNT_CLASSES;

interface AccountSpec {
  username: string;
  name: string;
  role: Role;
  passwordEnv: string;
  taOf?: ClassKey;
  studentOf?: ClassKey;
}

export const ACCOUNTS: AccountSpec[] = [
  {
    username: 'admin',
    name: 'Admin',
    role: Role.ADMIN,
    passwordEnv: 'SEED_PASSWORD_ADMIN'
  },
  {
    username: 'ta.a',
    name: 'TA A',
    role: Role.TA,
    passwordEnv: 'SEED_PASSWORD_TA_A',
    taOf: 'first'
  },
  {
    username: 'ta.b',
    name: 'TA B',
    role: Role.TA,
    passwordEnv: 'SEED_PASSWORD_TA_B',
    taOf: 'second'
  },
  {
    username: 'sv.an',
    name: 'Student An',
    role: Role.STUDENT,
    passwordEnv: 'SEED_PASSWORD_STUDENT_AN',
    studentOf: 'first'
  },
  {
    username: 'sv.binh',
    name: 'Student Binh',
    role: Role.STUDENT,
    passwordEnv: 'SEED_PASSWORD_STUDENT_BINH',
    studentOf: 'first'
  }
];

export const MIN_PASSWORD_LENGTH = 12;

/** Throws before touching the database if a password is missing or too short. */
export function readAccountPasswords(env: NodeJS.ProcessEnv): Map<string, string> {
  const problems: string[] = [];
  const passwords = new Map<string, string>();
  for (const a of ACCOUNTS) {
    const value = env[a.passwordEnv];
    if (!value) problems.push(`${a.passwordEnv} is not set`);
    else if (value.length < MIN_PASSWORD_LENGTH)
      problems.push(`${a.passwordEnv} is shorter than ${MIN_PASSWORD_LENGTH} characters`);
    else passwords.set(a.username, value);
  }
  // Names only, never values: this message ends up in logs.
  if (problems.length) throw new Error(`Cannot seed accounts: ${problems.join('; ')}.`);
  return passwords;
}

export async function seedAccounts(
  client: PrismaClient,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  const passwords = readAccountPasswords(env);

  const classIds = {} as Record<ClassKey, string>;
  for (const key of Object.keys(ACCOUNT_CLASSES) as ClassKey[]) {
    const c = ACCOUNT_CLASSES[key];
    const row = await client.class.upsert({
      where: { code: c.code },
      create: c,
      update: { name: c.name }
    });
    classIds[key] = row.id;
  }

  for (const a of ACCOUNTS) {
    const passwordHash = await hashPassword(passwords.get(a.username)!);
    const user = await client.user.upsert({
      where: { username: a.username },
      create: { username: a.username, name: a.name, role: a.role, passwordHash },
      update: { name: a.name, role: a.role, passwordHash, token: null }
    });
    // A re-run may change the password: old logins stop working.
    await client.session.deleteMany({ where: { userId: user.id } });

    if (a.taOf) {
      await client.classTA.createMany({
        data: [{ classId: classIds[a.taOf], userId: user.id }],
        skipDuplicates: true
      });
    }
    if (a.studentOf) {
      await client.classStudent.createMany({
        data: [{ classId: classIds[a.studentOf], userId: user.id }],
        skipDuplicates: true
      });
    }
  }

  return ACCOUNTS.map((a) => a.username);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAccounts(prisma, process.env)
    .then((usernames) => console.log(`[Accounts] Ready: ${usernames.join(', ')}.`))
    .catch((err: Error) => {
      console.error(`[Accounts] ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
