import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { ACCOUNTS, ACCOUNT_CLASSES, seedAccounts } from '../../prisma/accounts';
import { disconnectTestDatabase, resetTestDatabase } from '../helpers/test-db';

// Passwords made up for this test only; the deployment sets its own in the environment.
const env = Object.fromEntries(
  ACCOUNTS.map((a, i) => [a.passwordEnv, `test-only-password-${i}`])
) as NodeJS.ProcessEnv;

describe('deployed test accounts (npm run db:seed:accounts)', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates 1 admin, 2 TAs of two classes, 2 students of the first class', async () => {
    await seedAccounts(prisma, env);

    const first = await prisma.class.findUniqueOrThrow({
      where: { code: ACCOUNT_CLASSES.first.code },
      include: { tas: { include: { user: true } }, students: { include: { user: true } } }
    });
    const second = await prisma.class.findUniqueOrThrow({
      where: { code: ACCOUNT_CLASSES.second.code },
      include: { tas: { include: { user: true } }, students: true }
    });

    expect(first.tas.map((t) => t.user.username)).toEqual(['ta.a']);
    expect(first.students.map((s) => s.user.username).sort()).toEqual([
      'sv.an',
      'sv.binh'
    ]);
    expect(second.tas.map((t) => t.user.username)).toEqual(['ta.b']);
    expect(second.students).toHaveLength(0);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(admin.role).toBe('ADMIN');
    expect(admin.token).toBeNull();
  });

  it('every account logs in with the password from the environment', async () => {
    await seedAccounts(prisma, env);

    for (const a of ACCOUNTS) {
      const res = await request(app)
        .post('/v1/auth/login')
        .send({ username: a.username, password: env[a.passwordEnv] });
      expect(res.status, a.username).toBe(200);
    }
  });

  it('running it twice changes nothing but the passwords, and signs out old sessions', async () => {
    await seedAccounts(prisma, env);
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'ta.a', password: env.SEED_PASSWORD_TA_A });
    const before = await prisma.user.count();

    await seedAccounts(prisma, { ...env, SEED_PASSWORD_TA_A: 'a-new-password-for-ta' });

    expect(await prisma.user.count()).toBe(before);
    expect(await prisma.classTA.count({ where: { user: { username: 'ta.a' } } })).toBe(1);
    const me = await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(401);
  });

  it('refuses to start when a password is missing or short, and never prints a value', async () => {
    const { SEED_PASSWORD_ADMIN: _unused, ...missing } = env;
    await expect(seedAccounts(prisma, missing)).rejects.toThrow(
      /SEED_PASSWORD_ADMIN is not set/
    );

    const short = { ...env, SEED_PASSWORD_TA_B: 'xyzzy42' };
    const error = await seedAccounts(prisma, short).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/SEED_PASSWORD_TA_B is shorter than 12/);
    for (const value of Object.values(short)) {
      expect((error as Error).message).not.toContain(value);
    }
    expect(await prisma.user.count({ where: { username: 'admin' } })).toBe(0);
  });
});
