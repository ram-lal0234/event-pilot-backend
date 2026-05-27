CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'DIALING', 'RINGING', 'ANSWERED', 'AI_ACTIVE', 'COMPLETED', 'FAILED');

CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "call_uuid" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'plivo',
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_events" (
    "id" UUID NOT NULL,
    "call_id" UUID,
    "call_uuid" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'plivo',
    "type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calls_call_uuid_key" ON "calls"("call_uuid");
CREATE INDEX "calls_event_id_idx" ON "calls"("event_id");
CREATE INDEX "calls_guest_id_idx" ON "calls"("guest_id");
CREATE INDEX "calls_status_idx" ON "calls"("status");
CREATE UNIQUE INDEX "call_events_idempotency_key_key" ON "call_events"("idempotency_key");
CREATE INDEX "call_events_call_uuid_idx" ON "call_events"("call_uuid");
CREATE INDEX "call_events_type_idx" ON "call_events"("type");

ALTER TABLE "calls" ADD CONSTRAINT "calls_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
