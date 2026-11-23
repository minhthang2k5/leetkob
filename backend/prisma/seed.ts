import { PrismaClient, Role, LabStatus, ReviewVerdict } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

/**
 * Test fixtures only (test database, local dev). The deployed test accounts come from
 * prisma/accounts.ts, whose passwords are read from the environment.
 * This password is a fixture, not a secret: it only ever exists in a throw-away database.
 */
export const FIXTURE_PASSWORD = 'fixture-password';

// Hashing is deliberately slow; hash once per process, not on every test reset.
let fixtureHash: Promise<string> | undefined;
function fixturePasswordHash(): Promise<string> {
  fixtureHash ??= hashPassword(FIXTURE_PASSWORD);
  return fixtureHash;
}

export const SEED_DATA = {
  users: {
    admin: {
      id: '10000000-0000-0000-0000-000000000001',
      username: 'fixture.admin',
      name: 'System Admin',
      role: Role.ADMIN,
      token: 'token-admin'
    },
    taClassA: {
      id: '10000000-0000-0000-0000-000000000002',
      username: 'fixture.ta.a',
      name: 'TA Alice (Class A)',
      role: Role.TA,
      token: 'token-ta-class-a'
    },
    taClassB: {
      id: '10000000-0000-0000-0000-000000000003',
      username: 'fixture.ta.b',
      name: 'TA Bob (Class B)',
      role: Role.TA,
      token: 'token-ta-class-b'
    },
    student: {
      id: '10000000-0000-0000-0000-000000000004',
      username: 'fixture.student',
      name: 'Student Charlie',
      role: Role.STUDENT,
      token: 'token-student'
    },
    // Owns the judged fixture submissions behind the review states below; never logs in.
    reviewedStudent: {
      id: '10000000-0000-4000-8000-000000000005',
      username: 'fixture.reviewed',
      name: 'Student Reviewed (fixture)',
      role: Role.STUDENT,
      token: null
    }
  },
  classes: {
    classA: {
      id: '20000000-0000-4000-8000-000000000001',
      code: 'CSC13114-A',
      name: 'Sorting Lab Class A'
    },
    classB: {
      id: '20000000-0000-4000-8000-000000000002',
      code: 'CSC13114-B',
      name: 'Sorting Lab Class B'
    }
  },
  labs: {
    ready: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Lab 1 - Sorting Algorithms (Ready)',
      status: LabStatus.DRAFT,
      publishedAt: null
    },
    adminReady: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      title: 'Lab 2 - Admin Ready',
      status: LabStatus.DRAFT,
      publishedAt: null
    },
    pendingViolation: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      title: 'Lab 3 - Pending Violation Reviews',
      status: LabStatus.DRAFT,
      publishedAt: null
    },
    pendingSampledPass: {
      id: '550e8400-e29b-41d4-a716-446655440003',
      title: 'Lab 4 - Pending Sampled Pass Reviews',
      status: LabStatus.DRAFT,
      publishedAt: null
    },
    alreadyPublished: {
      id: '550e8400-e29b-41d4-a716-446655440004',
      title: 'Lab 5 - Already Published',
      status: LabStatus.PUBLISHED,
      publishedAt: new Date('2026-11-08T06:00:00.000Z')
    },
    concurrent: {
      id: '550e8400-e29b-41d4-a716-446655440005',
      title: 'Lab 6 - Concurrent Publish Testing',
      status: LabStatus.DRAFT,
      publishedAt: null
    },
    classB: {
      id: '550e8400-e29b-41d4-a716-446655440006',
      title: 'Lab 7 - Class B Lab',
      status: LabStatus.DRAFT,
      publishedAt: null
    }
  }
};

export async function seedDatabase(client: PrismaClient = prisma) {
  // Clean existing records in reverse dependency order
  // Deleting labs and users cascades to tests, constraints, submissions, verdicts, sessions.
  await client.lab.deleteMany();
  await client.classTA.deleteMany();
  await client.class.deleteMany();
  await client.user.deleteMany();

  // 1. Seed Users
  const passwordHash = await fixturePasswordHash();
  await client.user.createMany({
    data: Object.values(SEED_DATA.users).map((u) => ({ ...u, passwordHash }))
  });

  // 2. Seed Classes
  await client.class.createMany({
    data: Object.values(SEED_DATA.classes)
  });

  // 3. Assign TAs to Classes
  await client.classTA.createMany({
    data: [
      { classId: SEED_DATA.classes.classA.id, userId: SEED_DATA.users.taClassA.id },
      { classId: SEED_DATA.classes.classB.id, userId: SEED_DATA.users.taClassB.id }
    ]
  });

  // The fixture student is enrolled in class A (contract B.3: students see their classes)
  await client.classStudent.create({
    data: { classId: SEED_DATA.classes.classA.id, userId: SEED_DATA.users.student.id }
  });

  // 4. Seed Labs
  await client.lab.createMany({
    data: [
      { ...SEED_DATA.labs.ready, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.adminReady, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.pendingViolation, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.pendingSampledPass, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.alreadyPublished, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.concurrent, classId: SEED_DATA.classes.classA.id },
      { ...SEED_DATA.labs.classB, classId: SEED_DATA.classes.classB.id }
    ]
  });

  // 5. Review states (publish.md 3.2), as judged submissions with one verdict each.
  // Code "F1" and an old date keep these rows out of the way of PA#3 tests and of the
  // submission limit. Each row: [lab, verdict, isSampled, isReviewed].
  const reviewStates: [string, ReviewVerdict, boolean, boolean][] = [
    // ready: every required review done
    [SEED_DATA.labs.ready.id, ReviewVerdict.VIOLATION, false, true],
    [SEED_DATA.labs.ready.id, ReviewVerdict.PASS, true, true],
    [SEED_DATA.labs.adminReady.id, ReviewVerdict.PASS, true, true],
    // pendingViolation: 1 unreviewed VIOLATION
    [SEED_DATA.labs.pendingViolation.id, ReviewVerdict.VIOLATION, false, false],
    // pendingSampledPass: 1 unreviewed sampled PASS
    [SEED_DATA.labs.pendingSampledPass.id, ReviewVerdict.PASS, true, false],
    [SEED_DATA.labs.concurrent.id, ReviewVerdict.PASS, true, true]
  ];
  const judgedAt = new Date('2026-11-08T05:00:00.000Z');
  const constraintOf = new Map<string, string>();
  for (const [labId, verdict, isSampled, isReviewed] of reviewStates) {
    if (!constraintOf.has(labId)) {
      const c = await client.constraint.create({
        data: {
          labId,
          code: 'F1',
          text: 'Do not use `std::sort`.',
          deduction: 1,
          kind: 'BAN_LIST'
        }
      });
      constraintOf.set(labId, c.id);
    }
    await client.submission.create({
      data: {
        labId,
        studentId: SEED_DATA.users.reviewedStudent.id,
        code: 'int main() { return 0; }\n',
        status: 'JUDGED',
        result: 'ACCEPTED',
        testsPassed: 1,
        testsTotal: 1,
        createdAt: judgedAt,
        judgedAt,
        verdicts: {
          create: {
            constraintId: constraintOf.get(labId)!,
            verdict,
            source: 'HARD_RULE',
            isSampled,
            isReviewed
          }
        }
      }
    });
  }

  console.log('[Seed] Database populated successfully with test fixtures.');
}

if (require.main === module) {
  // Fixture users have fixed tokens and a known password: never in a deployment.
  if (process.env.NODE_ENV === 'production') {
    console.error('[Seed] Refusing to load test fixtures when NODE_ENV=production.');
    console.error(
      '[Seed] Use `npm run db:seed:accounts` for the deployed test accounts.'
    );
    process.exit(1);
  }
  seedDatabase()
    .catch((err) => {
      console.error('[Seed Error]:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
