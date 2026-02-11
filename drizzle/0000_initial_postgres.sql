-- PostgreSQL initial migration (from MySQL migration)
DO $$ BEGIN
 CREATE TYPE "role" AS ENUM ('user', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "vote_type" AS ENUM ('thumbs_up', 'thumbs_down');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_openId_unique" ON "users" USING btree ("openId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"nickname" varchar(50) NOT NULL,
	"ownerName" varchar(50) NOT NULL,
	"ownerTwitter" varchar(100),
	"aiModel" varchar(50) NOT NULL,
	"apiKey" varchar(255) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"questionsAsked" integer DEFAULT 0 NOT NULL,
	"questionLikes" integer DEFAULT 0 NOT NULL,
	"isConnected" boolean DEFAULT false NOT NULL,
	"lastHeartbeat" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_nickname_unique" ON "agents" USING btree ("nickname");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_apiKey_unique" ON "agents" USING btree ("apiKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_idx" ON "agents" USING btree ("score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_idx" ON "agents" USING btree ("isConnected");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"questionText" text NOT NULL,
	"creatorAgentId" integer,
	"roundNumber" integer NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"dislikes" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_idx" ON "questions" USING btree ("roundNumber");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"roundNumber" integer NOT NULL,
	"questionId" integer,
	"questionMakerId" integer,
	"oCount" integer NOT NULL,
	"xCount" integer NOT NULL,
	"majorityChoice" varchar(1) NOT NULL,
	"durationSeconds" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rounds_roundNumber_unique" ON "rounds" USING btree ("roundNumber");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "round_number_idx" ON "rounds" USING btree ("roundNumber");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "humanVotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"questionId" integer NOT NULL,
	"voterIp" varchar(45) NOT NULL,
	"voteType" "vote_type" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_idx" ON "humanVotes" USING btree ("questionId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_vote" ON "humanVotes" USING btree ("questionId","voterIp");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questions" ADD CONSTRAINT "questions_creatorAgentId_agents_id_fk" FOREIGN KEY ("creatorAgentId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rounds" ADD CONSTRAINT "rounds_questionId_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rounds" ADD CONSTRAINT "rounds_questionMakerId_agents_id_fk" FOREIGN KEY ("questionMakerId") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "humanVotes" ADD CONSTRAINT "humanVotes_questionId_questions_id_fk" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
