CREATE TYPE "ExamAudienceDeliveryMode" AS ENUM ('ONLINE', 'PHYSICAL');

CREATE TABLE "ExamPaper" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "courseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExamPaperRevision" (
  "id" TEXT NOT NULL, "paperId" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "type" "ExamType" NOT NULL, "totalMarks" INTEGER NOT NULL, "paperPdfUrl" TEXT,
  "mcqPayload" JSONB, "allowTypedAnswers" BOOLEAN NOT NULL DEFAULT true,
  "allowPdfUpload" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamPaperRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExamAudience" (
  "id" TEXT NOT NULL, "examId" TEXT NOT NULL, "label" TEXT NOT NULL,
  "deliveryMode" "ExamAudienceDeliveryMode" NOT NULL, "instituteId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExamAudience_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExamParticipant" (
  "id" TEXT NOT NULL, "examId" TEXT NOT NULL, "audienceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ExamParticipant_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Exam" ADD COLUMN "paperRevisionId" TEXT, ADD COLUMN "audienceRevision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "rosterRevision" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "ExamPaperRevision_paperId_version_key" ON "ExamPaperRevision"("paperId", "version");
CREATE UNIQUE INDEX "ExamAudience_id_examId_key" ON "ExamAudience"("id", "examId");
CREATE UNIQUE INDEX "ExamParticipant_examId_userId_key" ON "ExamParticipant"("examId", "userId");
CREATE INDEX "Exam_paperRevisionId_idx" ON "Exam"("paperRevisionId");
CREATE INDEX "ExamPaper_courseId_idx" ON "ExamPaper"("courseId"); CREATE INDEX "ExamPaper_createdById_idx" ON "ExamPaper"("createdById");
CREATE INDEX "ExamPaperRevision_paperId_idx" ON "ExamPaperRevision"("paperId"); CREATE INDEX "ExamAudience_examId_idx" ON "ExamAudience"("examId"); CREATE INDEX "ExamAudience_instituteId_idx" ON "ExamAudience"("instituteId"); CREATE INDEX "ExamParticipant_audienceId_examId_idx" ON "ExamParticipant"("audienceId", "examId"); CREATE INDEX "ExamParticipant_userId_idx" ON "ExamParticipant"("userId");
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamPaperRevision" ADD CONSTRAINT "ExamPaperRevision_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_paperRevisionId_fkey" FOREIGN KEY ("paperRevisionId") REFERENCES "ExamPaperRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamAudience" ADD CONSTRAINT "ExamAudience_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamAudience" ADD CONSTRAINT "ExamAudience_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamParticipant" ADD CONSTRAINT "ExamParticipant_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamParticipant" ADD CONSTRAINT "ExamParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamParticipant" ADD CONSTRAINT "ExamParticipant_audienceId_examId_fkey" FOREIGN KEY ("audienceId", "examId") REFERENCES "ExamAudience"("id", "examId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamAudience" ADD CONSTRAINT "exam_audience_delivery_matches_institute" CHECK (("deliveryMode" = 'ONLINE' AND "instituteId" IS NULL) OR ("deliveryMode" = 'PHYSICAL' AND "instituteId" IS NOT NULL));

CREATE FUNCTION prevent_exam_paper_revision_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ExamPaperRevision rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_paper_revision_immutable
BEFORE UPDATE OR DELETE ON "ExamPaperRevision"
FOR EACH ROW EXECUTE FUNCTION prevent_exam_paper_revision_mutation();
