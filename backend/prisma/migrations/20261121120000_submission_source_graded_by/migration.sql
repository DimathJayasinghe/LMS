CREATE TYPE "SubmissionSource" AS ENUM ('ONLINE', 'HALL');
ALTER TABLE "Submission" ADD COLUMN "source" "SubmissionSource" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN "gradedById" TEXT;
CREATE INDEX "Submission_gradedById_idx" ON "Submission"("gradedById");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
