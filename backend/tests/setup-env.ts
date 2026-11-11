import dotenv from 'dotenv';

// Tests always run against the dedicated test database, never DATABASE_URL (dev).
// Local: values come from backend/.env. CI: values come from the workflow environment.
dotenv.config();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Copy .env.example to .env and start the database ' +
      '(docker compose up -d), then run `npm run db:test:setup` once.'
  );
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
