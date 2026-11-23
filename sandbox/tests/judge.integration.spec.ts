import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection, createServer } from 'node:net';
import { judge, DEFAULT_LIMITS, SandboxInfrastructureError } from '../src';
import {
  COMPILATION_BUDGET,
  dockerCommand,
  runContainer,
  SANDBOX_LABEL
} from '../src/docker';
import { labs, resourceCases, studentCases } from './fixtures/labs';
import { prepareSandbox } from './prepare';

const source = (file: string) => readFile(file, 'utf8');
const attack = (name: string) => source(join(__dirname, '../attacks', `${name}.cpp`));
let baselineContainers: string[];

beforeAll(async () => {
  await prepareSandbox();
  baselineContainers = (
    await dockerCommand(['ps', '--all', '--quiet', '--filter', `label=${SANDBOX_LABEL}`])
  )
    .split('\n')
    .filter(Boolean);
}, 300000);

afterAll(async () => {
  const remaining = (
    await dockerCommand(['ps', '--all', '--quiet', '--filter', `label=${SANDBOX_LABEL}`])
  )
    .split('\n')
    .filter(Boolean);
  expect(remaining.sort()).toEqual(baselineContainers.sort());
});

async function recovery() {
  const result = await judge(
    await source(studentCases.find((c) => c.name === 'accepted-scan.cpp')!.path),
    labs[0].tests.slice(0, 1)
  );
  expect(result.result).toBe('ACCEPTED');
}

describe('complete student submissions through real Docker', () => {
  it('has six independent problems and 36 labelled full submissions', () => {
    expect(labs).toHaveLength(6);
    expect(studentCases).toHaveLength(36);
    for (const lab of labs) {
      expect(studentCases.filter((c) => c.lab === lab)).toHaveLength(6);
      const results = studentCases.filter((c) => c.lab === lab).map((c) => c.result);
      expect(results.filter((r) => r === 'ACCEPTED')).toHaveLength(2);
      expect(results.filter((r) => r === 'WRONG_ANSWER')).toHaveLength(2);
      expect(results.filter((r) => r === 'COMPILE_ERROR')).toHaveLength(1);
      expect(results.filter((r) => r === 'RUNTIME_ERROR')).toHaveLength(1);
      for (const test of lab.tests) {
        expect(Buffer.byteLength(test.input)).toBeLessThanOrEqual(65536);
        expect(Buffer.byteLength(test.expectedOutput)).toBeLessThanOrEqual(65536);
      }
    }
    expect(labs[0].tests[0].expectedOutput).toBe('6 3\n');
    expect(labs[1].tests[1].expectedOutput).toBe('1 1 2 2\n');
    expect(labs[2].tests[1].expectedOutput).toBe('0\n3\n-1\n');
  });

  it.each(studentCases)('$lab.id/$name returns $result', async (fixture) => {
    const code = await source(fixture.path);
    expect(Buffer.byteLength(code)).toBeLessThanOrEqual(65536);
    const result = await judge(code, fixture.lab.tests);
    expect(result.result).toBe(fixture.result);
    expect(result.testsTotal).toBe(fixture.lab.tests.length);
    expect(result.testsPassed).toBeGreaterThanOrEqual(0);
    expect(result.testsPassed).toBeLessThanOrEqual(result.testsTotal);
    expect(result.durationMs).toBeGreaterThan(0);
    if (fixture.result === 'ACCEPTED') expect(result.testsPassed).toBe(result.testsTotal);
    else expect(result.testsPassed).toBeLessThan(result.testsTotal);
    if (fixture.result === 'COMPILE_ERROR') {
      expect(result.compileOutput).toBeTruthy();
      expect(Buffer.byteLength(result.compileOutput!)).toBeLessThanOrEqual(4096);
    } else expect(result.compileOutput).toBeNull();
  });

  it.each(resourceCases)(
    'a realistic resource mistake returns $result',
    async (fixture) => {
      expect((await judge(await source(fixture.path), [fixture.test])).result).toBe(
        fixture.result
      );
      await recovery();
    }
  );
});

describe('judge contract on real processes', () => {
  const echo = '#include <iostream>\nint main(){ std::cout << std::cin.rdbuf(); }';
  it('preserves significant spaces, accepts trailing spaces and stops at the first failure', async () => {
    const result = await judge(echo, [
      { input: '1 2   \n\n', expectedOutput: '1 2\n' },
      { input: '1  2\n', expectedOutput: '1 2\n' },
      { input: 'unreached', expectedOutput: 'unreached' }
    ]);
    expect(result).toMatchObject({
      result: 'WRONG_ANSWER',
      testsPassed: 1,
      testsTotal: 3,
      compileOutput: null
    });
  });
  it('handles empty and Unicode streams without losing bytes', async () => {
    expect(
      await judge(echo, [
        { input: '', expectedOutput: '' },
        { input: 'Tiếng Việt 😀\n', expectedOutput: 'Tiếng Việt 😀\n' }
      ])
    ).toMatchObject({ result: 'ACCEPTED', testsPassed: 2 });
  });
  it('accepts exactly 64 KiB output and a 64 KiB input', async () => {
    const input = 'x'.repeat(65536);
    expect((await judge(echo, [{ input, expectedOutput: input }])).result).toBe(
      'ACCEPTED'
    );
  });
  it('accepts a valid source file at the 64 KiB byte boundary', async () => {
    const prefix = '#include <iostream>\nint main(){std::cout << "ok";}\n//';
    const code = prefix + 'x'.repeat(65536 - Buffer.byteLength(prefix));
    expect(Buffer.byteLength(code)).toBe(65536);
    expect((await judge(code, [{ input: '', expectedOutput: 'ok' }])).result).toBe(
      'ACCEPTED'
    );
  });
  it('does not turn invalid UTF-8 bytes into a matching replacement character', async () => {
    const code = '#include <iostream>\nint main(){std::cout.put(char(255));}';
    expect((await judge(code, [{ input: '', expectedOutput: '\uFFFD' }])).result).toBe(
      'WRONG_ANSWER'
    );
  });
  it('caps compiler diagnostics at 4 KiB', async () => {
    const code = Array.from(
      { length: 250 },
      (_, i) => `#error missing_definition_${i}`
    ).join('\n');
    const result = await judge(code, [{ input: '', expectedOutput: '' }]);
    expect(result.result).toBe('COMPILE_ERROR');
    expect(Buffer.byteLength(result.compileOutput!)).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(result.compileOutput!)).toBeGreaterThan(3000);
  });
  it('cannot forge supervisor result codes with exit(12)', async () => {
    const code = '#include <cstdlib>\nint main(){ std::exit(12); }';
    expect((await judge(code, [{ input: '', expectedOutput: '' }])).result).toBe(
      'RUNTIME_ERROR'
    );
  });
  it('does not leak writable files between tests', async () => {
    const code =
      '#include <fstream>\n#include <iostream>\nint main(){ std::ifstream old("/work/previous"); std::cout << (old.good()?"dirty":"clean"); std::ofstream file("/work/previous"); file << "hello"; }';
    expect(
      (
        await judge(
          code,
          Array.from({ length: 2 }, () => ({ input: '', expectedOutput: 'clean' }))
        )
      ).result
    ).toBe('ACCEPTED');
  });
  it('accepts a legitimate 64 MiB working set', async () => {
    const code =
      '#include <vector>\n#include <iostream>\nint main(){ std::vector<int> data(16*1024*1024, 1); long long sum=0; for(int x:data) sum+=x; std::cout<<sum; }';
    expect((await judge(code, [{ input: '', expectedOutput: '16777216' }])).result).toBe(
      'ACCEPTED'
    );
  });
  it('throws an infrastructure exception when Docker cannot be contacted', async () => {
    const saved = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = 'tcp://127.0.0.1:1';
    try {
      await expect(
        judge(echo, [{ input: '', expectedOutput: '' }])
      ).rejects.toBeInstanceOf(SandboxInfrastructureError);
    } finally {
      if (saved === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = saved;
    }
  });
});

describe('nine bounded security attacks against the real sandbox', () => {
  it.each([
    ['cpu', '123\n', 'TIME_LIMIT'],
    ['wall', '30\n', 'TIME_LIMIT'],
    ['memory', '', 'MEMORY_LIMIT'],
    ['output', '1000000\n', 'OUTPUT_LIMIT']
  ] as const)(
    '%s attack is contained and the next submission succeeds',
    async (name, input, result) => {
      expect(
        (await judge(await attack(name), [{ input, expectedOutput: '' }])).result
      ).toBe(result);
      await recovery();
    }
  );
  it('process creation hits the pids limit and all children are cleaned up', async () => {
    expect(
      (
        await judge(await attack('processes'), [
          { input: '', expectedOutput: 'limited\n' }
        ])
      ).result
    ).toBe('ACCEPTED');
    await recovery();
  });
  it('cannot connect to a controlled host endpoint', async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await new Promise<void>((resolve, reject) => {
        const client = createConnection(port, '127.0.0.1');
        client.resume();
        client.on('end', resolve);
        client.on('error', reject);
      });
      expect(connections).toBe(1);
      expect(
        (
          await judge(await attack('network'), [
            { input: `${port}\n`, expectedOutput: 'denied\n' }
          ])
        ).result
      ).toBe('ACCEPTED');
      expect(connections).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
  it('keeps the root filesystem read-only while allowing isolated scratch work', async () => {
    expect(
      (
        await judge(await attack('filesystem'), [
          { input: '', expectedOutput: 'isolated\n' }
        ])
      ).result
    ).toBe('ACCEPTED');
  });
  it('never exposes a host canary, server environment or Docker socket', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'leetkob-canary-'));
    const canary = join(directory, 'host-only.txt');
    await writeFile(canary, 'test-only-not-a-secret');
    const saved = process.env.LEETKOB_TEST_CANARY;
    process.env.LEETKOB_TEST_CANARY = 'test-only-not-a-secret';
    try {
      expect(
        (
          await judge(await attack('host-data'), [
            { input: `${canary}\n`, expectedOutput: 'absent\n' }
          ])
        ).result
      ).toBe('ACCEPTED');
    } finally {
      if (saved === undefined) delete process.env.LEETKOB_TEST_CANARY;
      else process.env.LEETKOB_TEST_CANARY = saved;
      await rm(directory, { recursive: true });
    }
  });
  it('has no root uid, effective capabilities or privilege escalation', async () => {
    expect(
      (
        await judge(await attack('privileges'), [
          { input: '', expectedOutput: 'unprivileged\n' }
        ])
      ).result
    ).toBe('ACCEPTED');
  });
  it('bounds the combined captured stdout/stderr in bytes', async () => {
    const compiled = await runContainer(
      'compile',
      Buffer.from(await attack('output')),
      '',
      { ...DEFAULT_LIMITS, ...COMPILATION_BUDGET }
    );
    expect(compiled.result).toBe('ACCEPTED');
    const run = await runContainer('run', compiled.stdout, '1000000\n', DEFAULT_LIMITS);
    expect(run.result).toBe('OUTPUT_LIMIT');
    expect(run.stdout.length + run.stderr.length).toBeLessThanOrEqual(
      DEFAULT_LIMITS.outputBytes
    );
  });
});
