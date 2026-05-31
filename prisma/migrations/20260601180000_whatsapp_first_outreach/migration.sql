-- WhatsApp-first RSVP outreach funnel

CREATE TYPE "OutreachStatus" AS ENUM (
  'IDLE',
  'WHATSAPP_INITIAL_SENT',
  'AWAITING_RSVP',
  'VOICE_SCHEDULED',
  'VOICE_ATTEMPTED',
  'WHATSAPP_REMINDER_SENT',
  'COMPLETE',
  'PAUSED',
  'NEEDS_PLANNER'
);

ALTER TABLE "event_settings"
  ADD COLUMN "outreach_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outreach_auto_start" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outreach_voice_delay_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "outreach_auto_call_mode" TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN "outreach_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "outreach_message_template" TEXT,
  ADD COLUMN "outreach_reminder_template" TEXT;

ALTER TABLE "guests"
  ADD COLUMN "outreach_status" "OutreachStatus" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "whatsapp_initial_sent_at" TIMESTAMP(3),
  ADD COLUMN "voice_auto_scheduled_at" TIMESTAMP(3),
  ADD COLUMN "voice_auto_triggered_at" TIMESTAMP(3),
  ADD COLUMN "whatsapp_reminder_sent_at" TIMESTAMP(3),
  ADD COLUMN "outreach_paused_at" TIMESTAMP(3);

CREATE INDEX "guests_event_id_outreach_status_idx" ON "guests"("event_id", "outreach_status");

CREATE TABLE "outreach_logs" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "guest_id" UUID NOT NULL,
  "step" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outreach_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outreach_logs_event_id_idx" ON "outreach_logs"("event_id");
CREATE INDEX "outreach_logs_guest_id_idx" ON "outreach_logs"("guest_id");

ALTER TABLE "outreach_logs"
  ADD CONSTRAINT "outreach_logs_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
