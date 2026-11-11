import { prisma } from '../../src/utils/prisma';
import { seedDatabase } from '../../prisma/seed';

/**
 * resetTestDatabase() deletes every row before re-seeding. Refuse to run unless the
 * connected database is clearly a test database, so a test run can never wipe dev data.
 */
function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset database "${dbName}": name must end with "_test". ` +
        'Set TEST_DATABASE_URL to a dedicated test database.'
    );
  }
}

export async function resetTestDatabase(): Promise<void> {
  assertTestDatabase();
  await seedDatabase(prisma);
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
