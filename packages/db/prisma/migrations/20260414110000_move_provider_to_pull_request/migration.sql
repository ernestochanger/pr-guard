ALTER TABLE "PullRequest" ADD COLUMN IF NOT EXISTS "aiProvider" "AIProvider";

UPDATE "PullRequest"
SET "aiProvider" = COALESCE(
  (SELECT "defaultAiProvider" FROM "AppSettings" WHERE "id" = 'app'),
  'OPENAI'::"AIProvider"
)
WHERE "aiProvider" IS NULL;

ALTER TABLE "PullRequest" ALTER COLUMN "aiProvider" SET DEFAULT 'OPENAI';
ALTER TABLE "PullRequest" ALTER COLUMN "aiProvider" SET NOT NULL;

ALTER TABLE "RepositorySettings" DROP COLUMN IF EXISTS "aiProvider";
