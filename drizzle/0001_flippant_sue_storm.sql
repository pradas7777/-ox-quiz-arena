CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nickname` varchar(50) NOT NULL,
	`ownerName` varchar(50) NOT NULL,
	`ownerTwitter` varchar(100),
	`aiModel` varchar(50) NOT NULL,
	`apiKey` varchar(255) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`score` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`questionsAsked` int NOT NULL DEFAULT 0,
	`questionLikes` int NOT NULL DEFAULT 0,
	`isConnected` boolean NOT NULL DEFAULT false,
	`lastHeartbeat` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `agents_nickname_unique` UNIQUE(`nickname`),
	CONSTRAINT `agents_apiKey_unique` UNIQUE(`apiKey`)
);
--> statement-breakpoint
CREATE TABLE `humanVotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` int NOT NULL,
	`voterIp` varchar(45) NOT NULL,
	`voteType` enum('thumbs_up','thumbs_down') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `humanVotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_vote` UNIQUE(`questionId`,`voterIp`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionText` text NOT NULL,
	`creatorAgentId` int,
	`roundNumber` int NOT NULL,
	`likes` int NOT NULL DEFAULT 0,
	`dislikes` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roundNumber` int NOT NULL,
	`questionId` int,
	`questionMakerId` int,
	`oCount` int NOT NULL,
	`xCount` int NOT NULL,
	`majorityChoice` varchar(1) NOT NULL,
	`durationSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rounds_id` PRIMARY KEY(`id`),
	CONSTRAINT `rounds_roundNumber_unique` UNIQUE(`roundNumber`)
);
--> statement-breakpoint
ALTER TABLE `humanVotes` ADD CONSTRAINT `humanVotes_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_creatorAgentId_agents_id_fk` FOREIGN KEY (`creatorAgentId`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rounds` ADD CONSTRAINT `rounds_questionId_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `questions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rounds` ADD CONSTRAINT `rounds_questionMakerId_agents_id_fk` FOREIGN KEY (`questionMakerId`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `score_idx` ON `agents` (`score`);--> statement-breakpoint
CREATE INDEX `connected_idx` ON `agents` (`isConnected`);--> statement-breakpoint
CREATE INDEX `question_idx` ON `humanVotes` (`questionId`);--> statement-breakpoint
CREATE INDEX `round_idx` ON `questions` (`roundNumber`);--> statement-breakpoint
CREATE INDEX `round_number_idx` ON `rounds` (`roundNumber`);