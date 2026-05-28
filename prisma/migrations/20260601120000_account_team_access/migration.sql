-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');
CREATE TYPE "AccessLevel" AS ENUM ('FULL', 'READ_ONLY');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_members" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "user_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "role" "AccountRole" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invite_code" TEXT NOT NULL,
    "invited_by_id" UUID,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_access" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'FULL',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_access_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add account_id nullable first
ALTER TABLE "events" ADD COLUMN "account_id" UUID;

-- Backfill: one account per user who created events
DO $$
DECLARE
  r RECORD;
  new_account_id UUID;
  new_member_id UUID;
  invite_code TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id AS user_id, u.email
    FROM users u
    INNER JOIN events e ON e.created_by = u.id
    WHERE e.deleted_at IS NULL
  LOOP
    new_account_id := gen_random_uuid();
    new_member_id := gen_random_uuid();
    invite_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

    INSERT INTO accounts (id, name, owner_id, created_at, updated_at)
    VALUES (
      new_account_id,
      split_part(r.email, '@', 1) || ' Events',
      r.user_id,
      NOW(),
      NOW()
    );

    INSERT INTO account_members (
      id, account_id, user_id, email, role, status, invite_code,
      invited_at, accepted_at, created_at, updated_at
    )
    VALUES (
      new_member_id,
      new_account_id,
      r.user_id,
      r.email,
      'OWNER',
      'ACCEPTED',
      invite_code,
      NOW(),
      NOW(),
      NOW(),
      NOW()
    );

    UPDATE events
    SET account_id = new_account_id
    WHERE created_by = r.user_id AND account_id IS NULL;
  END LOOP;
END $$;

-- For any remaining events without account (orphan), attach to first owner account if exists
-- (skip if none)

ALTER TABLE "events" ALTER COLUMN "account_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_owner_id_key" ON "accounts"("owner_id");
CREATE UNIQUE INDEX "account_members_user_id_key" ON "account_members"("user_id");
CREATE UNIQUE INDEX "account_members_invite_code_key" ON "account_members"("invite_code");
CREATE UNIQUE INDEX "account_members_account_id_email_key" ON "account_members"("account_id", "email");
CREATE INDEX "account_members_account_id_idx" ON "account_members"("account_id");
CREATE INDEX "events_account_id_idx" ON "events"("account_id");
CREATE UNIQUE INDEX "event_access_member_id_event_id_key" ON "event_access"("member_id", "event_id");
CREATE INDEX "event_access_event_id_idx" ON "event_access"("event_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "account_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
