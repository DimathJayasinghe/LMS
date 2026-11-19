-- Private, ordered course learning modules and their downloadable resources.
-- Additive only: existing courses and content remain untouched.
CREATE TYPE "CourseModuleStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "CourseMaterialType" AS ENUM ('FILE');

CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "status" "CourseModuleStatus" NOT NULL DEFAULT 'DRAFT',
    "releaseAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseMaterial" (
    "id" TEXT NOT NULL,
    "type" "CourseMaterialType" NOT NULL DEFAULT 'FILE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "objectKey" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "downloadable" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "moduleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseMaterial_objectKey_key" ON "CourseMaterial"("objectKey");
CREATE INDEX "CourseModule_courseId_position_idx" ON "CourseModule"("courseId", "position");
CREATE INDEX "CourseModule_courseId_status_releaseAt_idx" ON "CourseModule"("courseId", "status", "releaseAt");
CREATE INDEX "CourseModule_deletedAt_idx" ON "CourseModule"("deletedAt");
CREATE INDEX "CourseMaterial_moduleId_position_idx" ON "CourseMaterial"("moduleId", "position");
CREATE INDEX "CourseMaterial_deletedAt_idx" ON "CourseMaterial"("deletedAt");

ALTER TABLE "CourseModule"
ADD CONSTRAINT "CourseModule_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseMaterial"
ADD CONSTRAINT "CourseMaterial_moduleId_fkey"
FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
