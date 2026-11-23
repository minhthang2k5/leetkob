import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  ScryptOptions
} from 'node:crypto';

// scrypt from node:crypto, no dependency (contract B.3). Stored as
// "scrypt$N$r$p$<salt base64>$<hash base64>" so parameters can change later.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** False for a wrong password and for a stored value that is not a valid hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scrypt(password, salt, { N: n, r, p });
  return timingSafeEqual(actual, expected);
}

/**
 * Compared against when the username does not exist, so an unknown username takes as
 * long as a wrong password and the response time does not reveal which names exist.
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
