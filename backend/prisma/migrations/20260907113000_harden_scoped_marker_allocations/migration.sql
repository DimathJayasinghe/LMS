-- Prevent a grant row from combining an assignment for one exam with an
-- audience from another. Both composite FKs now share the same examId.
CREATE UNIQUE INDEX "MarkerAssignment_id_examId_key" ON "MarkerAssignment"("id", "examId");
ALTER TABLE "MarkerAssignmentAudience" DROP CONSTRAINT "MarkerAssignmentAudience_assignmentId_fkey";
ALTER TABLE "MarkerAssignmentAudience"
  ADD CONSTRAINT "MarkerAssignmentAudience_assignmentId_examId_fkey"
  FOREIGN KEY ("assignmentId", "examId") REFERENCES "MarkerAssignment"("id", "examId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve exactly how a grant was requested and whether it was an explicit
-- whole-current-exam choice, independently of its expanded audience rows.
ALTER TABLE "MarkerAssignmentAudience"
  ADD COLUMN "source" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "MarkerAssignment"
  ADD COLUMN "allAudiences" BOOLEAN NOT NULL DEFAULT false;
UPDATE "MarkerAssignment" AS assignment SET "allAudiences" = true
  FROM "Exam" AS exam WHERE assignment."examId" = exam."id" AND exam."paperRevisionId" IS NULL;
ALTER TABLE "MarkerAllocationRevision"
  ADD COLUMN "sourceState" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "evidenceState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "requestState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "MarkerAllocationRevision_examId_actorId_idempotencyKey_key"
  ON "MarkerAllocationRevision"("examId", "actorId", "idempotencyKey");
