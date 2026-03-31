CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(64) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"summary" text,
	"emotion_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "emotion_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"primary_emotion" varchar(32) NOT NULL,
	"secondary_emotion" varchar(32),
	"intensity" real NOT NULL,
	"trigger" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factual_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(64) NOT NULL,
	"key" varchar(256) NOT NULL,
	"value" text NOT NULL,
	"importance" real DEFAULT 0.5 NOT NULL,
	"source" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"original_text" text NOT NULL,
	"summary" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personality_customizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"panel_description" text,
	"composed_directive" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personality_customizations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "semantic_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024),
	"importance" real DEFAULT 0.5 NOT NULL,
	"emotional_intensity" real DEFAULT 0 NOT NULL,
	"topic" varchar(128),
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"stage" varchar(32) DEFAULT 'stranger' NOT NULL,
	"intimacy_score" integer DEFAULT 0 NOT NULL,
	"signal_interaction_freq" real DEFAULT 0 NOT NULL,
	"signal_conversation_depth" real DEFAULT 0 NOT NULL,
	"signal_emotional_intensity" real DEFAULT 0 NOT NULL,
	"signal_trust_level" real DEFAULT 0 NOT NULL,
	"signal_timespan" real DEFAULT 0 NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"last_interaction" timestamp,
	"emotion_trend" varchar(64),
	"topics" text[],
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_relations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" varchar(256) NOT NULL,
	"platform" varchar(64) NOT NULL,
	"name" varchar(256),
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emotion_states" ADD CONSTRAINT "emotion_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factual_memories" ADD CONSTRAINT "factual_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_adjustments" ADD CONSTRAINT "personality_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personality_customizations" ADD CONSTRAINT "personality_customizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_memories" ADD CONSTRAINT "semantic_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relations" ADD CONSTRAINT "user_relations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversations_user" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_emotion_user_time" ON "emotion_states" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_factual_user_cat_key" ON "factual_memories" USING btree ("user_id","category","key");--> statement-breakpoint
CREATE INDEX "idx_factual_user" ON "factual_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_semantic_user" ON "semantic_memories" USING btree ("user_id");