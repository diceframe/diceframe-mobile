CREATE TABLE `items` (
	`local_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`format` text NOT NULL,
	`document` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`rule_id` text DEFAULT '' NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`origin` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "items_kind_check" CHECK("items"."kind" IN ('character_template', 'lorebook')),
	CONSTRAINT "items_revision_check" CHECK("items"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_items_kind_updated` ON `items` (`kind`,`updated_at`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rule_cache` (
	`server_key` text NOT NULL,
	`rule_id` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`server_key`, `rule_id`)
);
--> statement-breakpoint
CREATE TABLE `server_links` (
	`server_instance_id` text NOT NULL,
	`local_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`state_token` text DEFAULT '' NOT NULL,
	`synced_revision` integer DEFAULT 0 NOT NULL,
	`synced_digest` text DEFAULT '' NOT NULL,
	`base_url_hint` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`server_instance_id`, `local_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_server_links_canonical` ON `server_links` (`server_instance_id`,`canonical_id`);