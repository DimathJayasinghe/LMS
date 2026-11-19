-- Prevent a grant row from combining an assignment for one exam with an
-- audience from another. Both composite FKs now share the same examId.
CREATE UNIQUE INDEX "MarkerAssignment_id_examId_key" ON "MarkerAssignment"("id", "examId");
ALTER TABLE "MarkerAssignmentAudience" DROP CONSTRAINT "MarkerAssignmentAudience_assignmentId_fkey";
ALTER TABLE "MarkerAssignmentAudience"
  ADD CONSTRAINT "MarkerAssignmentAudience_assignmentId_examId_fkey"
  FOREIGN KEY ("assignmentId", "examId") REFERENCES "MarkerAssignment"("id", "examId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve exactly how a grant was requested and whether it was an explicit
-- whole-current-exam choice, independently of its expanded audience rows.
ALTER TABLE "MarkerAssignmentAudience"
  ADD COLUMN "source" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "MarkerAssignment"
  ADD COLUMN "allAudiences" BOOLEAN NOT NULL DEFAULT false;
UPDATE "MarkerAssignment" AS assignment SET "allAudiences" = true
  FROM "Exam" AS exam WHERE assignment."examId" = exam."id" AND exam."paperRevisionId" IS NULL;
-- Markers already assigned to an exam that the previous migration scoped (non-NULL
-- paperRevisionId) kept whole-exam access before grants existed. Preserve exactly that:
-- one grant per audience of the exam, recorded as an explicit whole-exam direct source.
UPDATE "MarkerAssignment" AS assignment SET "allAudiences" = true
  FROM "Exam" AS exam WHERE assignment."examId" = exam."id" AND exam."paperRevisionId" IS NOT NULL;
INSERT INTO "MarkerAssignmentAudience" ("id", "assignmentId", "examId", "audienceId", "source")
SELECT gen_random_uuid()::text, assignment."id", assignment."examId", audience."id",
  jsonb_build_array(jsonb_build_object('type', 'DIRECT', 'id', assignment."markerId", 'allAudiences', true, 'audienceIds', '[]'::jsonb))
FROM "MarkerAssignment" AS assignment
JOIN "Exam" AS exam ON exam."id" = assignment."examId" AND exam."paperRevisionId" IS NOT NULL
JOIN "ExamAudience" AS audience ON audience."examId" = exam."id";
ALTER TABLE "MarkerAllocationRevision"
  ADD COLUMN "sourceState" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "evidenceState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "requestState" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "MarkerAllocationRevision_examId_actorId_idempotencyKey_key"
  ON "MarkerAllocationRevision"("examId", "actorId", "idempotencyKey");
