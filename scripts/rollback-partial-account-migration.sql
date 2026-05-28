-- Use ONLY if you want to re-run migrate deploy from scratch after a failed attempt.
-- This drops account-team objects created by the partial migration.

DROP TABLE IF EXISTS event_access;
DROP TABLE IF EXISTS account_members;
DROP TABLE IF EXISTS accounts;
ALTER TABLE events DROP COLUMN IF EXISTS account_id;

DROP TYPE IF EXISTS "AccountRole";
DROP TYPE IF EXISTS "AccessLevel";
DROP TYPE IF EXISTS "InviteStatus";

-- Then:
--   npx prisma migrate resolve --rolled-back 20260601120000_account_team_access
--   npx prisma migrate deploy
