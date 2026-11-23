import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/utils/password';

describe('password hashing (contract B.3: scrypt, per-user salt)', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
  });

  it('never stores the password, and two hashes of one password differ (salt)', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password')
    ]);
    expect(a).not.toContain('same-password');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
  });

  it('treats a stored value that is not a valid hash as a wrong password', async () => {
    for (const bad of [
      '',
      'plain-text',
      'scrypt$1$2$3',
      'bcrypt$16384$8$1$c2FsdA==$aGFzaA=='
    ]) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });
});
