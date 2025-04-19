-- Add linkAccess and linkToken to Project
ALTER TABLE "Project"
ADD COLUMN     "linkAccess" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "linkToken" TEXT;

-- Set a random linkToken for existing projects
UPDATE "Project" SET "linkToken" = substr(md5(random()::text), 1, 24) WHERE "linkToken" IS NULL;
