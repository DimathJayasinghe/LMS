-- Track public display assets by their server-issued object key so replacement
-- and removal can clean up storage safely. Existing legacy URLs remain visible
-- until an authorized teacher or super admin replaces/removes them.
ALTER TABLE "Course"
ADD COLUMN "bannerKey" TEXT,
ADD COLUMN "bannerAlt" TEXT,
ADD COLUMN "backdropKey" TEXT,
ADD COLUMN "backdropAlt" TEXT;
