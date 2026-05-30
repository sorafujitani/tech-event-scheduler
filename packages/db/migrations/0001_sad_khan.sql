CREATE TABLE `attendance_counter` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text DEFAULT 'main' NOT NULL,
	`capacity` integer,
	`current_value` integer DEFAULT 0 NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attendance_counter_event_idx` ON `attendance_counter` (`event_id`);--> statement-breakpoint
CREATE TABLE `attendance_event` (
	`id` text PRIMARY KEY NOT NULL,
	`counter_id` text NOT NULL,
	`kind` text DEFAULT 'adjust' NOT NULL,
	`delta` integer NOT NULL,
	`seq` integer NOT NULL,
	`value_after` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`acted_by_user_id` text,
	`acted_at_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`counter_id`) REFERENCES `attendance_counter`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `attendance_event_counter_seq_idx` ON `attendance_event` (`counter_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_event_counter_idem_uq` ON `attendance_event` (`counter_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by_user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`public_slug` text,
	`external_url` text,
	`starts_at_ms` integer,
	`ends_at_ms` integer,
	`timezone` text DEFAULT 'Asia/Tokyo' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_public_slug_uq` ON `event` (`public_slug`);--> statement-breakpoint
CREATE INDEX `event_created_by_idx` ON `event` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `event_status_starts_idx` ON `event` (`status`,`starts_at_ms`);--> statement-breakpoint
CREATE TABLE `event_member` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`invited_email` text,
	`role` text DEFAULT 'manager' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invited_by_user_id` text,
	`invited_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_member_event_user_uq` ON `event_member` (`event_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_member_event_invited_email_uq` ON `event_member` (`event_id`,`invited_email`) WHERE "event_member"."user_id" IS NULL AND "event_member"."invited_email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `event_member_user_idx` ON `event_member` (`user_id`);--> statement-breakpoint
CREATE INDEX `event_member_event_idx` ON `event_member` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_member_event_user_status_idx` ON `event_member` (`event_id`,`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `event_module` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`module_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_module_uq` ON `event_module` (`event_id`,`module_type`);--> statement-breakpoint
CREATE INDEX `event_module_event_idx` ON `event_module` (`event_id`);--> statement-breakpoint
CREATE TABLE `schedule_item` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`kind` text DEFAULT 'session' NOT NULL,
	`track` text DEFAULT 'main' NOT NULL,
	`title` text NOT NULL,
	`speaker` text,
	`note` text,
	`order_index` integer NOT NULL,
	`planned_start_at_ms` integer,
	`planned_duration_sec` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`actual_started_at_ms` integer,
	`accumulated_pause_ms` integer DEFAULT 0 NOT NULL,
	`paused_at_ms` integer,
	`ended_at_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_item_event_order_idx` ON `schedule_item` (`event_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `schedule_item_event_status_idx` ON `schedule_item` (`event_id`,`status`);