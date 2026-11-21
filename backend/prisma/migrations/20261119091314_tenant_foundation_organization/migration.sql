-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "CourseContentProgress" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "CourseMaterial" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "CourseModule" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ExamAudience" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ExamPaper" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ExamPaperRevision" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "ExamParticipant" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "IdempotencyRecord" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Institute" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerAllocationRevision" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerAssignment" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerAssignmentAudience" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerGroup" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerGroupMember" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "MarkerGroupMembershipEvent" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "NotificationSetting" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "PaymentAdjustment" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "SmsLog" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "StudentBarcode" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "SubjectTeacher" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "VideoRecording" ADD COLUMN     "organizationId" TEXT DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Colombo',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Attendance_organizationId_idx" ON "Attendance"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "ClassSession_organizationId_idx" ON "ClassSession"("organizationId");

-- CreateIndex
CREATE INDEX "Course_organizationId_idx" ON "Course"("organizationId");

-- CreateIndex
CREATE INDEX "CourseContentProgress_organizationId_idx" ON "CourseContentProgress"("organizationId");

-- CreateIndex
CREATE INDEX "CourseMaterial_organizationId_idx" ON "CourseMaterial"("organizationId");

-- CreateIndex
CREATE INDEX "CourseModule_organizationId_idx" ON "CourseModule"("organizationId");

-- CreateIndex
CREATE INDEX "Enrollment_organizationId_idx" ON "Enrollment"("organizationId");

-- CreateIndex
CREATE INDEX "Exam_organizationId_idx" ON "Exam"("organizationId");

-- CreateIndex
CREATE INDEX "ExamAudience_organizationId_idx" ON "ExamAudience"("organizationId");

-- CreateIndex
CREATE INDEX "ExamPaper_organizationId_idx" ON "ExamPaper"("organizationId");

-- CreateIndex
CREATE INDEX "ExamPaperRevision_organizationId_idx" ON "ExamPaperRevision"("organizationId");

-- CreateIndex
CREATE INDEX "ExamParticipant_organizationId_idx" ON "ExamParticipant"("organizationId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_organizationId_idx" ON "IdempotencyRecord"("organizationId");

-- CreateIndex
CREATE INDEX "Institute_organizationId_idx" ON "Institute"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerAllocationRevision_organizationId_idx" ON "MarkerAllocationRevision"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerAssignment_organizationId_idx" ON "MarkerAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerAssignmentAudience_organizationId_idx" ON "MarkerAssignmentAudience"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerGroup_organizationId_idx" ON "MarkerGroup"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerGroupMember_organizationId_idx" ON "MarkerGroupMember"("organizationId");

-- CreateIndex
CREATE INDEX "MarkerGroupMembershipEvent_organizationId_idx" ON "MarkerGroupMembershipEvent"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "NotificationSetting_organizationId_idx" ON "NotificationSetting"("organizationId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");

-- CreateIndex
CREATE INDEX "PaymentAdjustment_organizationId_idx" ON "PaymentAdjustment"("organizationId");

-- CreateIndex
CREATE INDEX "Permission_organizationId_idx" ON "Permission"("organizationId");

-- CreateIndex
CREATE INDEX "RefreshToken_organizationId_idx" ON "RefreshToken"("organizationId");

-- CreateIndex
CREATE INDEX "SmsLog_organizationId_idx" ON "SmsLog"("organizationId");

-- CreateIndex
CREATE INDEX "StudentBarcode_organizationId_idx" ON "StudentBarcode"("organizationId");

-- CreateIndex
CREATE INDEX "Subject_organizationId_idx" ON "Subject"("organizationId");

-- CreateIndex
CREATE INDEX "SubjectTeacher_organizationId_idx" ON "SubjectTeacher"("organizationId");

-- CreateIndex
CREATE INDEX "Submission_organizationId_idx" ON "Submission"("organizationId");

-- CreateIndex
CREATE INDEX "TimetableSlot_organizationId_idx" ON "TimetableSlot"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "VideoRecording_organizationId_idx" ON "VideoRecording"("organizationId");

-- Default organization (ADR 14 section 3.1). The deterministic id is the column default added above, so
-- existing rows are backfilled by ADD COLUMN ... DEFAULT: PostgreSQL does not rewrite or fire row triggers
-- for it, which keeps the immutable evidence tables (payment adjustments, exam paper revisions, marker group
-- events, marker allocation revisions) untouched. Slug and code are placeholders; rename before launch.
INSERT INTO "Organization" ("id", "name", "slug", "code", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Default organization', 'default', 'DEF', CURRENT_TIMESTAMP);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTeacher" ADD CONSTRAINT "SubjectTeacher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseContentProgress" ADD CONSTRAINT "CourseContentProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRecording" ADD CONSTRAINT "VideoRecording_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperRevision" ADD CONSTRAINT "ExamPaperRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAudience" ADD CONSTRAINT "ExamAudience_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamParticipant" ADD CONSTRAINT "ExamParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerAssignment" ADD CONSTRAINT "MarkerAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerAssignmentAudience" ADD CONSTRAINT "MarkerAssignmentAudience_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerAllocationRevision" ADD CONSTRAINT "MarkerAllocationRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerGroup" ADD CONSTRAINT "MarkerGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerGroupMember" ADD CONSTRAINT "MarkerGroupMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkerGroupMembershipEvent" ADD CONSTRAINT "MarkerGroupMembershipEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsLog" ADD CONSTRAINT "SmsLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institute" ADD CONSTRAINT "Institute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBarcode" ADD CONSTRAINT "StudentBarcode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
