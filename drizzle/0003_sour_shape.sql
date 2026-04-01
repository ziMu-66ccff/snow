ALTER TABLE "conversations" RENAME COLUMN "started_at" TO "created_at";--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "ended_at";