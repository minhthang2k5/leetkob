import { prisma } from '../../src/utils/prisma';
import { seedDatabase } from '../../prisma/seed';

export async function resetTestDatabase(): Promise<void> {
  await seedDatabase(prisma);
}

export async function disconnectTestDatabase(): Promise<void> {
  await prisma.$disconnect();
}
