CREATE TABLE "emotion_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"dominant_emotion" varchar(32),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "emotion_trends_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "semantic_memories" ALTER COLUMN "embedding" SET DATA TYPE vector(1024);--> statement-breakpoint
ALTER TABLE "emotion_trends" ADD CONSTRAINT "emotion_trends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_emotion_trends_user" ON "emotion_trends" USING btree ("user_id");