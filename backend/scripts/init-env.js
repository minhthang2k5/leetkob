// Creates backend/.env from .env.example and fills the LOCAL development defaults
// (the throw-away database that `docker compose up -d` starts). Never overwrites an
// existing .env. No real secret is involved; production values never live in this repo.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');

if (fs.existsSync(target)) {
  console.log('.env already exists; leaving it unchanged.');
  process.exit(0);
}

const defaults = {
  PORT: '3000',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/leetkob_dev?schema=public',
  TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/leetkob_test?schema=public'
};

const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const filled = example
  .split(/\r?\n/)
  .map((line) => {
    const m = /^([A-Z_]+)=$/.exec(line);
    return m && defaults[m[1]] !== undefined ? `${m[1]}="${defaults[m[1]]}"` : line;
  })
  .join('\n');

fs.writeFileSync(target, filled);
console.log('Created .env with local development defaults.');
