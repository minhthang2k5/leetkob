import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src';
import { containerArguments } from '../src/docker';

describe('sandbox launch policy', () => {
  it.each(['compile', 'run'] as const)('isolates the %s phase', (mode) => {
    const args = containerArguments('test-container', DEFAULT_LIMITS, mode);
    for (const [flag, value] of [
      ['--network', 'none'],
      ['--user', '1000:1000'],
      ['--memory', '256m'],
      ['--memory-swap', '256m'],
      ['--pids-limit', '64'],
      ['--cap-drop', 'ALL'],
      ['--security-opt', 'no-new-privileges'],
      ['--log-driver', 'none']
    ])
      expect(args[args.indexOf(flag) + 1]).toBe(value);
    expect(args).toContain('--read-only');
    for (const forbidden of [
      '-v',
      '--volume',
      '--mount',
      '--privileged',
      '-e',
      '--env',
      '--env-file'
    ]) {
      expect(args).not.toContain(forbidden);
    }
    expect(args.join(' ')).not.toContain('docker.sock');
    expect(args[args.indexOf('--tmpfs') + 1]).toContain(
      '/work:rw,exec,nosuid,nodev,size=64m'
    );
  });
});
