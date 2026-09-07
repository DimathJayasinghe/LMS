DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM "Exam" WHERE "id" = 'legacy-fixture-exam' AND "title" = 'Legacy fixture exam' AND "paperPdfUrl" = 'legacy/paper.pdf' AND "totalMarks" = 77 AND "paperRevisionId" IS NULL) THEN RAISE EXCEPTION 'legacy exam fixture was altered'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Submission" WHERE "id" = 'legacy-fixture-submission' AND "examId" = 'legacy-fixture-exam' AND "userId" = 'legacy-fixture-student' AND "marks" = 71 AND "feedback" = 'legacy mark') THEN RAISE EXCEPTION 'legacy submission fixture was altered'; END IF;
END $$;
