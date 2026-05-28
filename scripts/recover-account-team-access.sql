-- Recovery for failed 20260601120000_account_team_access (gen_random_bytes / pgcrypto).
-- Run against the same DB as DATABASE_URL, then:
--   npx prisma migrate resolve --applied 20260601120000_account_team_access

-- 1) Backfill accounts if tables exist but backfill never ran
DO $$
DECLARE
  r RECORD;
  new_account_id UUID;
  new_member_id UUID;
  invite_code TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    RAISE EXCEPTION 'accounts table missing — run prisma migrate deploy after fixing migration SQL';
  END IF;

  FOR r IN
    SELECT DISTINCT u.id AS user_id, u.email
    FROM users u
    INNER JOIN events e ON e.created_by = u.id
    WHERE e.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM account_members am
        WHERE am.user_id = u.id AND am.status = 'ACCEPTED' AND am.revoked_at IS NULL
      )
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
    WHERE created_by = r.user_id AND (account_id IS NULL);
  END LOOP;
END $$;

-- 2) Finish schema if migration stopped before NOT NULL / indexes / FKs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'account_id'
      AND is_nullable = 'YES'
  ) THEN
  IF EXISTS (SELECT 1 FROM events WHERE account_id IS NULL) THEN
    RAISE EXCEPTION 'Some events still have null account_id — run backfill first';
  END IF;
    ALTER TABLE events ALTER COLUMN account_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_id_key ON accounts(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_members_user_id_key ON account_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS account_members_invite_code_key ON account_members(invite_code);
CREATE UNIQUE INDEX IF NOT EXISTS account_members_account_id_email_key ON account_members(account_id, email);
CREATE INDEX IF NOT EXISTS account_members_account_id_idx ON account_members(account_id);
CREATE INDEX IF NOT EXISTS events_account_id_idx ON events(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS event_access_member_id_event_id_key ON event_access(member_id, event_id);
CREATE INDEX IF NOT EXISTS event_access_event_id_idx ON event_access(event_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_owner_id_fkey') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_account_id_fkey') THEN
    ALTER TABLE account_members ADD CONSTRAINT account_members_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_members_user_id_fkey') THEN
    ALTER TABLE account_members ADD CONSTRAINT account_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_access_member_id_fkey') THEN
    ALTER TABLE event_access ADD CONSTRAINT event_access_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES account_members(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_access_event_id_fkey') THEN
    ALTER TABLE event_access ADD CONSTRAINT event_access_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_account_id_fkey') THEN
    ALTER TABLE events ADD CONSTRAINT events_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
