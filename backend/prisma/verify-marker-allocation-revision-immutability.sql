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
ROLLBACK;
