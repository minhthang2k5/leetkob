// Applies the Prisma migrations to the dedicated test database (TEST_DATABASE_URL).
// Cross-platform: works the same in PowerShell, bash and GitHub Actions.
require('dotenv').config();
const { execSync } = require('node:child_process');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url }
});
