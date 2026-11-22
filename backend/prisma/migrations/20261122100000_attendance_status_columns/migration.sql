-- The single Attendance migration (D-ACCESS-5): status, staff marking and voiding, the entrance-scan
-- snapshot, live duration and the scan institute. Expand only: every column is nullable or defaulted,
-- so code that does not know them keeps working.

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'PARTIAL', 'EXCUSED');

-- CreateEnum
CREATE TYPE "EnrollmentScanState" AS ENUM ('ENROLLED', 'NOT_ENROLLED', 'MODE_MISMATCH');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "enrollmentStateAtScan" "EnrollmentScanState",
ADD COLUMN     "instituteId" TEXT,
ADD COLUMN     "markedById" TEXT,
ADD COLUMN     "paidAtScan" BOOLEAN,
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateIndex
CREATE INDEX "Attendance_markedById_idx" ON "Attendance"("markedById");

-- CreateIndex
CREATE INDEX "Attendance_voidedById_idx" ON "Attendance"("voidedById");

-- CreateIndex
CREATE INDEX "Attendance_instituteId_idx" ON "Attendance"("instituteId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_instituteId_fkey" FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
