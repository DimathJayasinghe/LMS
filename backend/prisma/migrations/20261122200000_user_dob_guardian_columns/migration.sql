-- Date of birth and the single guardian a registration slip captures, so minors can be registered correctly now.
-- Expand only: every column is nullable, so code that does not know them keeps working. The guardian table
-- (Wave 2 T21) copies these four columns into guardian rows before it drops them.
-- Rollback: revert the PR; the columns stay unused.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "guardianConsentAt" TIMESTAMP(3),
ADD COLUMN     "guardianMobile" TEXT,
ADD COLUMN     "guardianName" TEXT;
