-- Scoped exam marker allocations are materialized to immutable audience-bound
-- grants at confirmation. Existing MarkerAssignment rows keep their legacy
-- whole-exam meaning for exams with a NULL paperRevisionId.
CREATE TABLE "MarkerAssignmentAudience" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "audienceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkerAssignmentAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarkerAllocationRevision" (
  "id" TEXT NOT NULL,
  "examId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "beforeState" JSONB NOT NULL,
  "afterState" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarkerAllocationRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarkerAssignmentAudience_assignmentId_audienceId_key"
  ON "MarkerAssignmentAudience"("assignmentId", "audienceId");
CREATE INDEX "MarkerAssignmentAudience_examId_audienceId_idx"
  ON "MarkerAssignmentAudience"("examId", "audienceId");
CREATE UNIQUE INDEX "MarkerAllocationRevision_examId_revision_key"
  ON "MarkerAllocationRevision"("examId", "revision");
CREATE INDEX "MarkerAllocationRevision_examId_createdAt_idx"
  ON "MarkerAllocationRevision"("examId", "createdAt");
CREATE INDEX "MarkerAllocationRevision_actorId_idx"
  ON "MarkerAllocationRevision"("actorId");

ALTER TABLE "MarkerAssignmentAudience"
  ADD CONSTRAINT "MarkerAssignmentAudience_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "MarkerAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MarkerAssignmentAudience_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MarkerAssignmentAudience_audienceId_examId_fkey"
  FOREIGN KEY ("audienceId", "examId") REFERENCES "ExamAudience"("id", "examId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarkerAllocationRevision"
  ADD CONSTRAINT "MarkerAllocationRevision_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MarkerAllocationRevision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_marker_allocation_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MarkerAllocationRevision rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marker_allocation_revision_immutable
BEFORE UPDATE OR DELETE ON "MarkerAllocationRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_marker_allocation_revision_mutation();
