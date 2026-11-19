CREATE TABLE ai_review_usage (
 id TEXT PRIMARY KEY NOT NULL,
 day TEXT NOT NULL,
 client TEXT NOT NULL,
 minute INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_review_day_idx ON ai_review_usage(day);
--> statement-breakpoint
CREATE INDEX ai_review_client_idx ON ai_review_usage(day,client,minute);
