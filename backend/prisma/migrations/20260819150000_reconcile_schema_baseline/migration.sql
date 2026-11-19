-- This migration reconciles the pre-launch initial schema with the current schema.
-- It intentionally runs only on an empty legacy database. A database previously
-- managed by prisma db push must use the baseline-adoption runbook instead; that
-- path preserves data and records this migration as already applied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User")
    OR EXISTS (SELECT 1 FROM "Course")
    OR EXISTS (SELECT 1 FROM "Enrollment")
    OR EXISTS (SELECT 1 FROM "Payment")
    OR EXISTS (SELECT 1 FROM "ClassSession")
    OR EXISTS (SELECT 1 FROM "Attendance")
    OR EXISTS (SELECT 1 FROM "VideoRecording")
    OR EXISTS (SELECT 1 FROM "Exam")
    OR EXISTS (SELECT 1 FROM "Submission")
    OR EXISTS (SELECT 1 FROM "MarkerAssignment")
    OR EXISTS (SELECT 1 FROM "AuditLog")
    OR EXISTS (SELECT 1 FROM "SmsLog")
    OR EXISTS (SELECT 1 FROM "Permission")
  THEN
    RAISE EXCEPTION USING
      MESSAGE = 'baseline reconciliation requires an empty legacy database',
      HINT = 'Follow context/Guides_And_Summeries/database_migration_guide.md section 6 to adopt an existing db-push database.';
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'ENTRANCE', 'BULK', 'MANUAL');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RESULTS_PUBLISHED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERRIDDEN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS');

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'QR';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'TEACHER', 'ADMIN', 'MARKER', 'STUDENT');
ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
COMMIT;

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_adminId_fkey";

-- DropForeignKey
ALTER TABLE "Permission" DROP CONSTRAINT "Permission_userId_fkey";

-- DropIndex
DROP INDEX "AuditLog_adminId_idx";

-- DropIndex
DROP INDEX "Course_name_year_key";

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "source" SET DEFAULT 'QR';

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "adminId",
ADD COLUMN     "actorId" TEXT NOT NULL,
ADD COLUMN     "actorRole" TEXT NOT NULL,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "timetableSlotId" TEXT,
ADD COLUMN     "zoomPassword" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "backdropUrl" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "subjectId" TEXT NOT NULL,
ADD COLUMN     "teacherId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "allowPdfUpload" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowTypedAnswers" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "type" SET DEFAULT 'HYBRID';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectedAtInstituteId" TEXT,
ADD COLUMN     "collectedById" TEXT,
ADD COLUMN     "collectedViaBarcode" TEXT,
ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "writtenAnswers" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailChangedAt" TIMESTAMP(3),
ADD COLUMN     "nicBackUrl" TEXT,
ADD COLUMN     "nicFrontUrl" TEXT,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "profileImage" TEXT,
ADD COLUMN     "setupCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VideoRecording" ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING';

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "classType" "ClassType",
    "zoomLink" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "courseId" TEXT NOT NULL,
    "instituteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentBarcode" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instituteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE INDEX "Subject_isActive_idx" ON "Subject"("isActive");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSetting_type_channel_key" ON "NotificationSetting"("type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Institute_name_key" ON "Institute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Institute_code_key" ON "Institute"("code");

-- CreateIndex
CREATE INDEX "Institute_isActive_idx" ON "Institute"("isActive");

-- CreateIndex
CREATE INDEX "TimetableSlot_courseId_idx" ON "TimetableSlot"("courseId");

-- CreateIndex
CREATE INDEX "TimetableSlot_instituteId_idx" ON "TimetableSlot"("instituteId");

-- CreateIndex
CREATE INDEX "TimetableSlot_dayOfWeek_idx" ON "TimetableSlot"("dayOfWeek");

-- CreateIndex
CREATE INDEX "TimetableSlot_isActive_idx" ON "TimetableSlot"("isActive");

-- CreateIndex
CREATE INDEX "StudentBarcode_userId_idx" ON "StudentBarcode"("userId");

-- CreateIndex
CREATE INDEX "StudentBarcode_instituteId_idx" ON "StudentBarcode"("instituteId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBarcode_instituteId_barcode_key" ON "StudentBarcode"("instituteId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "StudentBarcode_userId_instituteId_key" ON "StudentBarcode"("userId", "instituteId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_timetableSlotId_date_key" ON "ClassSession"("timetableSlotId", "date");

-- CreateIndex
CREATE INDEX "Course_subjectId_idx" ON "Course"("subjectId");

-- CreateIndex
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subjectId_name_year_key" ON "Course"("subjectId", "name", "year");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_collectedAtInstituteId_idx" ON "Payment"("collectedAtInstituteId");

-- CreateIndex
CREATE INDEX "VideoRecording_bunnyVideoId_idx" ON "VideoRecording"("bunnyVideoId");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedAtInstituteId_fkey" FOREIGN KEY ("collectedAtInstituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_timetableSlotId_fkey" FOREIGN KEY ("timetableSlotId") REFERENCES "TimetableSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBarcode" ADD CONSTRAINT "StudentBarcode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentBarcode" ADD CONSTRAINT "StudentBarcode_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
