-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('NONE', 'NEEDS_FOLLOW_UP', 'CALLBACK_LATER', 'NO_ANSWER', 'VOICEMAIL', 'COMPLETED');

-- AlterTable
ALTER TABLE "cabs" ADD COLUMN     "driver_phone" TEXT,
ADD COLUMN     "pickup_time" TIMESTAMP(3),
ADD COLUMN     "route_zone" TEXT,
ADD COLUMN     "trip_status" TEXT;

-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "assigned_to" TEXT,
ADD COLUMN     "callback_at" TIMESTAMP(3),
ADD COLUMN     "follow_up_status" "FollowUpStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "last_contacted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "check_in_date" TIMESTAMP(3),
ADD COLUMN     "check_out_date" TIMESTAMP(3),
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "room_status" TEXT,
ADD COLUMN     "room_type" TEXT;

-- CreateTable
CREATE TABLE "guest_invites" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_invites_code_key" ON "guest_invites"("code");

-- CreateIndex
CREATE INDEX "guest_invites_guest_id_idx" ON "guest_invites"("guest_id");

-- CreateIndex
CREATE INDEX "guest_invites_code_revoked_at_expires_at_idx" ON "guest_invites"("code", "revoked_at", "expires_at");

-- AddForeignKey
ALTER TABLE "guest_invites" ADD CONSTRAINT "guest_invites_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
