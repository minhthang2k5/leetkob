import { createHash } from 'node:crypto';

/** Stable Bernoulli 10% audit sample; never depends on process order or Math.random. */
export function isSampledPass(
  seed: string,
  submissionId: string,
  constraintId: string
): boolean {
  const hash = createHash('sha256')
    .update(JSON.stringify([seed, submissionId, constraintId]))
    .digest();
  return hash.readUInt32BE(0) / 0x100000000 < 0.1;
}
