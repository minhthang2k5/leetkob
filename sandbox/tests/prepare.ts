import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { dockerExecutable, SANDBOX_IMAGE } from '../src/docker';

export async function prepareSandbox(): Promise<void> {
  const exec = promisify(execFile);
  const executable = dockerExecutable();
  try {
    await exec(executable, ['version', '--format', '{{.Server.Version}}'], {
      timeout: 15000,
      windowsHide: true
    });
  } catch {
    throw new Error(
      'Docker Linux Engine is required for sandbox integration tests. Start Docker Desktop; tests are not skipped.'
    );
  }
  await exec(executable, ['build', '--tag', SANDBOX_IMAGE, resolve(__dirname, '..')], {
    timeout: 240000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
}
