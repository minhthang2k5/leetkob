-- PA#3: required reviews now live in constraint_verdicts (pa3-interfaces.md B.6).
-- submission_reviews only ever held PA#2 test fixtures; no real data is lost.

-- DropForeignKey
ALTER TABLE "submission_reviews" DROP CONSTRAINT "submission_reviews_labId_fkey";

-- DropTable
DROP TABLE "submission_reviews";

