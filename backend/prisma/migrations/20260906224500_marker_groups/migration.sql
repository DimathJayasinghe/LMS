-- Reusable marker groups are configuration only. Existing MarkerAssignment
-- rows remain the sole source of exam access.
CREATE TYPE "MarkerGroupScope" AS ENUM ('COURSE', 'SUBJECT', 'INSTITUTE');
CREATE TYPE "MarkerGroupMembershipAction" AS ENUM ('ADDED', 'REMOVED');

CREATE TABLE "MarkerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "MarkerGroupScope" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "courseId" TEXT,
    "subjectId" TEXT,
    "instituteId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarkerGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarkerGroup"
  ADD CONSTRAINT "marker_group_scope_matches_target"
  CHECK (
    ("scope" = 'COURSE' AND "courseId" IS NOT NULL AND "subjectId" IS NULL AND "instituteId" IS NULL)
    OR ("scope" = 'SUBJECT' AND "courseId" IS NULL AND "subjectId" IS NOT NULL AND "instituteId" IS NULL)
    OR ("scope" = 'INSTITUTE' AND "courseId" IS NULL AND "subjectId" IS NULL AND "instituteId" IS NOT NULL)
  );

CREATE TABLE "MarkerGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" TEXT,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "MarkerGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarkerGroupMembershipEvent" (
    "id" TEXT NOT NULL,
    "action" "MarkerGroupMembershipAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "markerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarkerGroupMembershipEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarkerGroupMember_groupId_markerId_key" ON "MarkerGroupMember"("groupId", "markerId");
CREATE INDEX "MarkerGroup_courseId_idx" ON "MarkerGroup"("courseId");
CREATE INDEX "MarkerGroup_subjectId_idx" ON "MarkerGroup"("subjectId");
CREATE INDEX "MarkerGroup_instituteId_idx" ON "MarkerGroup"("instituteId");
CREATE INDEX "MarkerGroup_createdById_idx" ON "MarkerGroup"("createdById");
CREATE INDEX "MarkerGroup_isActive_idx" ON "MarkerGroup"("isActive");
CREATE INDEX "MarkerGroup_deletedAt_idx" ON "MarkerGroup"("deletedAt");
CREATE INDEX "MarkerGroupMember_groupId_idx" ON "MarkerGroupMember"("groupId");
CREATE INDEX "MarkerGroupMember_markerId_idx" ON "MarkerGroupMember"("markerId");
CREATE INDEX "MarkerGroupMember_removedAt_idx" ON "MarkerGroupMember"("removedAt");
CREATE INDEX "MarkerGroupMembershipEvent_groupId_createdAt_idx" ON "MarkerGroupMembershipEvent"("groupId", "createdAt");
CREATE INDEX "MarkerGroupMembershipEvent_markerId_idx" ON "MarkerGroupMembershipEvent"("markerId");
CREATE INDEX "MarkerGroupMembershipEvent_actorId_idx" ON "MarkerGroupMembershipEvent"("actorId");

ALTER TABLE "MarkerGroup" ADD CONSTRAINT "MarkerGroup_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroup" ADD CONSTRAINT "MarkerGroup_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroup" ADD CONSTRAINT "MarkerGroup_instituteId_fkey"
FOREIGN KEY ("instituteId") REFERENCES "Institute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroup" ADD CONSTRAINT "MarkerGroup_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMember" ADD CONSTRAINT "MarkerGroupMember_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "MarkerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMember" ADD CONSTRAINT "MarkerGroupMember_markerId_fkey"
FOREIGN KEY ("markerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMember" ADD CONSTRAINT "MarkerGroupMember_addedById_fkey"
FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMember" ADD CONSTRAINT "MarkerGroupMember_removedById_fkey"
FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMembershipEvent" ADD CONSTRAINT "MarkerGroupMembershipEvent_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "MarkerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMembershipEvent" ADD CONSTRAINT "MarkerGroupMembershipEvent_markerId_fkey"
FOREIGN KEY ("markerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarkerGroupMembershipEvent" ADD CONSTRAINT "MarkerGroupMembershipEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_marker_group_membership_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MarkerGroupMembershipEvent rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marker_group_membership_event_immutable
BEFORE UPDATE OR DELETE ON "MarkerGroupMembershipEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_marker_group_membership_event_mutation();
