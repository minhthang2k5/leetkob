-- CreateEnum
CREATE TYPE "ConstraintKind" AS ENUM ('BAN_LIST', 'SEMANTIC');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'JUDGED', 'FAILED');

-- CreateEnum
CREATE TYPE "JudgeResult" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'COMPILE_ERROR', 'OUTPUT_LIMIT');

-- CreateEnum
CREATE TYPE "VerdictSource" AS ENUM ('HARD_RULE', 'MODEL', 'GUARDRAIL');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('CONFIRMED', 'OVERRIDDEN_PASS', 'OVERRIDDEN_VIOLATION');

-- CreateEnum
CREATE TYPE "ModelCallStatus" AS ENUM ('OK', 'TIMEOUT', 'API_ERROR');

-- AlterTable
ALTER TABLE "labs" ADD COLUMN     "statement" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "class_students" (
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "class_students_pkey" PRIMARY KEY ("classId","userId")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraints" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "deduction" INTEGER NOT NULL,
    "kind" "ConstraintKind" NOT NULL,

    CONSTRAINT "constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "result" "JudgeResult",
    "testsPassed" INTEGER,
    "testsTotal" INTEGER,
    "compileOutput" TEXT,
    "durationMs" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "judgedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraint_verdicts" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "constraintId" TEXT NOT NULL,
    "verdict" "ReviewVerdict" NOT NULL,
    "source" "VerdictSource" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "isSampled" BOOLEAN NOT NULL DEFAULT false,
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "decision" "ReviewDecision",
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "constraint_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_calls" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requestId" TEXT,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "ms" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "status" "ModelCallStatus" NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_labId_position_key" ON "test_cases"("labId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "constraints_labId_code_key" ON "constraints"("labId", "code");

-- CreateIndex
CREATE INDEX "submissions_status_createdAt_idx" ON "submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "submissions_labId_studentId_createdAt_idx" ON "submissions"("labId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "constraint_verdicts_constraintId_idx" ON "constraint_verdicts"("constraintId");

-- CreateIndex
CREATE UNIQUE INDEX "constraint_verdicts_submissionId_constraintId_key" ON "constraint_verdicts"("submissionId", "constraintId");

-- CreateIndex
CREATE INDEX "model_calls_submissionId_idx" ON "model_calls"("submissionId");

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraints" ADD CONSTRAINT "constraints_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraint_verdicts" ADD CONSTRAINT "constraint_verdicts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraint_verdicts" ADD CONSTRAINT "constraint_verdicts_constraintId_fkey" FOREIGN KEY ("constraintId") REFERENCES "constraints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraint_verdicts" ADD CONSTRAINT "constraint_verdicts_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
