-- CI-only rollback proof for ExamPaperRevision immutability.
BEGIN;
INSERT INTO "User" ("id", "indexNumber", "email", "name", "password", "role", "updatedAt") VALUES
 ('ci-paper-admin', 900101, 'ci-paper-admin@example.invalid', 'CI Admin', 'x', 'SUPER_ADMIN', CURRENT_TIMESTAMP),
 ('ci-paper-teacher', 900102, 'ci-paper-teacher@example.invalid', 'CI Teacher', 'x', 'TEACHER', CURRENT_TIMESTAMP);
INSERT INTO "Subject" ("id", "name", "updatedAt") VALUES ('ci-paper-subject', 'CI Paper Subject', CURRENT_TIMESTAMP);
INSERT INTO "Course" ("id", "name", "year", "monthlyFee", "subjectId", "teacherId", "updatedAt") VALUES ('ci-paper-course', 'CI Paper Course', 2099, 0, 'ci-paper-subject', 'ci-paper-teacher', CURRENT_TIMESTAMP);
INSERT INTO "ExamPaper" ("id", "title", "courseId", "createdById", "updatedAt") VALUES ('ci-paper', 'CI paper', 'ci-paper-course', 'ci-paper-admin', CURRENT_TIMESTAMP);
INSERT INTO "ExamPaperRevision" ("id", "paperId", "version", "type", "totalMarks") VALUES ('ci-paper-revision', 'ci-paper', 1, 'WRITTEN', 100);
DO $$ BEGIN
 BEGIN UPDATE "ExamPaperRevision" SET "totalMarks" = 99 WHERE "id" = 'ci-paper-revision'; RAISE EXCEPTION 'ExamPaperRevision UPDATE unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ExamPaperRevision rows are immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM "ExamPaperRevision" WHERE "id" = 'ci-paper-revision'; RAISE EXCEPTION 'ExamPaperRevision DELETE unexpectedly succeeded'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'ExamPaperRevision rows are immutable' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
