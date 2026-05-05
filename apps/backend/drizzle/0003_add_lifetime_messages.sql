-- Add lifetime message counter to users table
-- Free users get 50 messages total (not per day)
ALTER TABLE "users" ADD COLUMN "total_messages_sent" integer DEFAULT 0 NOT NULL;

-- Backfill: set total_messages_sent from existing usage_daily sum
UPDATE "users" SET "total_messages_sent" = COALESCE(
  (SELECT SUM("messages_sent") FROM "usage_daily" WHERE "usage_daily"."user_id" = "users"."id"),
  0
);
