-- CI-only rollback proof for immutable scoped-marker allocation evidence.
BEGIN;
INSERT INTO "User" ("id", "indexNumber", "email", "name", "password", "role", "updatedAt") VALUES
 ('ci-marker-allocation-admin', 900201, 'ci-marker-allocation-admin@example.invalid', 'CI Admin', 'x', 'SUPER_ADMIN', CURRENT_TIMESTAMP),
 ('ci-marker-allocation-teacher', 900202, 'ci-marker-allocation-teacher@example.invalid', 'CI Teacher', 'x', 'TEACHER', CURRENT_TIMESTAMP);
INSERT INTO "Subject" ("id", "name", "updatedAt") VALUES ('ci-marker-allocation-subject', 'CI Marker Allocation Subject', CURRENT_TIMESTAMP);
INSERT INTO "Course" ("id", "name", "year", "monthlyFee", "subjectId", "teacherId", "updatedAt") VALUES ('ci-marker-allocation-course', 'CI Marker Allocation Course', 2099, 0, 'ci-marker-allocation-subject', 'ci-marker-allocation-teacher', CURRENT_TIMESTAMP);
INSERT INTO "Exam" ("id", "title", "type", "startTime", "endTime", "totalMarks", "courseId", "updatedAt") VALUES ('ci-marker-allocation-exam', 'CI marker allocation exam', 'WRITTEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 100, 'ci-marker-allocation-course', CURRENT_TIMESTAMP);
INSERT INTO "MarkerAllocationRevision" ("id", "examId", "revision", "reason", "digest", "beforeState", "afterState", "actorId") VALUES ('ci-marker-allocation-revision', 'ci-marker-allocation-exam', 1, 'CI proof', 'digest', '{}'::jsonb, '{}'::jsonb, 'ci-marker-allocation-admin');
DO $$ BEGIN
 BEGIN UPDATE "MarkerAllocationRevision" SET "reason" = 'changed' WHERE "id" = 'ci-marker-allocation-revision'; RAISE EXCEPTION 'MarkerAllocationRevision UPDATE unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MarkerAllocationRevision rows are immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM "MarkerAllocationRevision" WHERE "id" = 'ci-marker-allocation-revision'; RAISE EXCEPTION 'MarkerAllocationRevision DELETE unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MarkerAllocationRevision rows are immutable' THEN RAISE; END IF; END;
END $$;

-- The same trigger also protects the newly persisted source/version evidence.
DO $$ BEGIN
 BEGIN UPDATE "MarkerAllocationRevision" SET "sourceState" = '[]'::jsonb, "evidenceState" = '{"changed": true}'::jsonb WHERE "id" = 'ci-marker-allocation-revision'; RAISE EXCEPTION 'MarkerAllocationRevision evidence UPDATE unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MarkerAllocationRevision rows are immutable' THEN RAISE; END IF; END;
END $$;

INSERT INTO "Exam" ("id", "title", "type", "startTime", "endTime", "totalMarks", "courseId", "updatedAt") VALUES ('ci-marker-allocation-exam-b', 'CI exam B', 'WRITTEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 100, 'ci-marker-allocation-course', CURRENT_TIMESTAMP);
INSERT INTO "ExamAudience" ("id", "examId", "label", "deliveryMode", "updatedAt") VALUES
 ('ci-marker-audience-a', 'ci-marker-allocation-exam', 'A', 'ONLINE', CURRENT_TIMESTAMP),
 ('ci-marker-audience-b', 'ci-marker-allocation-exam-b', 'B', 'ONLINE', CURRENT_TIMESTAMP);
INSERT INTO "MarkerAssignment" ("id", "markerId", "examId") VALUES
 ('ci-marker-assignment-a', 'ci-marker-allocation-admin', 'ci-marker-allocation-exam'),
 ('ci-marker-assignment-b', 'ci-marker-allocation-admin', 'ci-marker-allocation-exam-b');
INSERT INTO "MarkerAssignmentAudience" ("id", "assignmentId", "examId", "audienceId") VALUES
 ('ci-marker-valid-grant', 'ci-marker-assignment-a', 'ci-marker-allocation-exam', 'ci-marker-audience-a');

DO $$
DECLARE failed_constraint TEXT;
BEGIN
 BEGIN
  INSERT INTO "MarkerAssignmentAudience" ("id", "assignmentId", "examId", "audienceId") VALUES ('ci-marker-invalid-assignment', 'ci-marker-assignment-a', 'ci-marker-allocation-exam-b', 'ci-marker-audience-b');
  RAISE EXCEPTION 'Cross-exam assignment grant unexpectedly succeeded';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS failed_constraint = CONSTRAINT_NAME;
  IF failed_constraint <> 'MarkerAssignmentAudience_assignmentId_examId_fkey' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO "MarkerAssignmentAudience" ("id", "assignmentId", "examId", "audienceId") VALUES ('ci-marker-invalid-audience', 'ci-marker-assignment-a', 'ci-marker-allocation-exam', 'ci-marker-audience-b');
  RAISE EXCEPTION 'Cross-exam audience grant unexpectedly succeeded';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS failed_constraint = CONSTRAINT_NAME;
  IF failed_constraint <> 'MarkerAssignmentAudience_audienceId_examId_fkey' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE "MarkerAssignmentAudience" SET "assignmentId" = 'ci-marker-assignment-b' WHERE "id" = 'ci-marker-valid-grant';
  RAISE EXCEPTION 'Cross-exam assignment UPDATE unexpectedly succeeded';
 EXCEPTION WHEN foreign_key_violation THEN
  GET STACKED DIAGNOSTICS failed_constraint = CONSTRAINT_NAME;
  IF failed_constraint <> 'MarkerAssignmentAudience_assignmentId_examId_fkey' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
