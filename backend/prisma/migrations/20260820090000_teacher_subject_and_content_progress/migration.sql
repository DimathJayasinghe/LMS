-- Subject-level teacher scope, controlled by SUPER_ADMIN.
CREATE TABLE "SubjectTeacher" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectTeacher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectTeacher_subjectId_teacherId_key"
ON "SubjectTeacher"("subjectId", "teacherId");
CREATE INDEX "SubjectTeacher_subjectId_idx" ON "SubjectTeacher"("subjectId");
CREATE INDEX "SubjectTeacher_teacherId_idx" ON "SubjectTeacher"("teacherId");

ALTER TABLE "SubjectTeacher" ADD CONSTRAINT "SubjectTeacher_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectTeacher" ADD CONSTRAINT "SubjectTeacher_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve current teaching access: every existing course owner becomes an
-- assigned teacher for that course's subject.
INSERT INTO "SubjectTeacher" ("id", "subjectId", "teacherId")
SELECT
    'subject-teacher-' || md5("subjectId" || ':' || "teacherId"),
    "subjectId",
    "teacherId"
FROM "Course"
ON CONFLICT ("subjectId", "teacherId") DO NOTHING;

-- Per-student marker used to compute and clear "new lesson" counts.
CREATE TABLE "CourseContentProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseContentProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseContentProgress_userId_courseId_key"
ON "CourseContentProgress"("userId", "courseId");
CREATE INDEX "CourseContentProgress_userId_idx" ON "CourseContentProgress"("userId");
CREATE INDEX "CourseContentProgress_courseId_idx" ON "CourseContentProgress"("courseId");

ALTER TABLE "CourseContentProgress" ADD CONSTRAINT "CourseContentProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseContentProgress" ADD CONSTRAINT "CourseContentProgress_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
