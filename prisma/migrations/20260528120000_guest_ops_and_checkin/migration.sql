-- Guest RSVP / ops fields
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "needs_cab" BOOLEAN,
ADD COLUMN IF NOT EXISTS "needs_hotel" BOOLEAN,
ADD COLUMN IF NOT EXISTS "guest_notes" TEXT,
ADD COLUMN IF NOT EXISTS "language" TEXT;

CREATE INDEX IF NOT EXISTS "guests_event_id_follow_up_status_idx" ON "guests"("event_id", "follow_up_status");
CREATE INDEX IF NOT EXISTS "guests_event_id_needs_cab_idx" ON "guests"("event_id", "needs_cab");
CREATE INDEX IF NOT EXISTS "guests_event_id_needs_hotel_idx" ON "guests"("event_id", "needs_hotel");

-- Allow gate + hotel check-in per guest
DROP INDEX IF EXISTS "checkins_guest_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "checkins_guest_id_location_type_key" ON "checkins"("guest_id", "location_type");
