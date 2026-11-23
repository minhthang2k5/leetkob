import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env.TEST_DATABASE_URL) {
  const file = resolve(__dirname, '../../backend/.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.slice(1).endsWith('_test')) {
  throw new Error(
    'Worker tests require TEST_DATABASE_URL pointing to a database whose name ends in _test.'
  );
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
