ALTER TABLE "account_members" ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);

UPDATE "account_members"
SET "onboarding_completed_at" = COALESCE("accepted_at", NOW())
WHERE "status" = 'ACCEPTED' AND "revoked_at" IS NULL;
