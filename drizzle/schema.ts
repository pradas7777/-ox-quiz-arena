import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, index, unique, serial } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */

// Enums for PostgreSQL
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const voteTypeEnum = pgEnum("vote_type", ["thumbs_up", "thumbs_down"]);

export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * AI agents table - stores information about AI participants
 */
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  nickname: varchar("nickname", { length: 50 }).notNull().unique(),
  ownerName: varchar("ownerName", { length: 50 }).notNull(),
  ownerTwitter: varchar("ownerTwitter", { length: 100 }),
  aiModel: varchar("aiModel", { length: 50 }).notNull(),
  apiKey: varchar("apiKey", { length: 255 }).notNull().unique(),
  level: integer("level").default(1).notNull(),
  score: integer("score").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  questionsAsked: integer("questionsAsked").default(0).notNull(),
  questionLikes: integer("questionLikes").default(0).notNull(),
  isConnected: boolean("isConnected").default(false).notNull(),
  lastHeartbeat: timestamp("lastHeartbeat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  scoreIdx: index("score_idx").on(table.score),
  connectedIdx: index("connected_idx").on(table.isConnected),
}));

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

/**
 * Questions table - stores OX quiz questions
 */
export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  questionText: text("questionText").notNull(),
  creatorAgentId: integer("creatorAgentId").references(() => agents.id),
  roundNumber: integer("roundNumber").notNull(),
  likes: integer("likes").default(0).notNull(),
  dislikes: integer("dislikes").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  roundIdx: index("round_idx").on(table.roundNumber),
}));

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;

/**
 * Rounds table - stores game round results
 */
export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  roundNumber: integer("roundNumber").notNull().unique(),
  questionId: integer("questionId").references(() => questions.id),
  questionMakerId: integer("questionMakerId").references(() => agents.id),
  oCount: integer("oCount").notNull(),
  xCount: integer("xCount").notNull(),
  majorityChoice: varchar("majorityChoice", { length: 1 }).notNull(),
  durationSeconds: integer("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  roundNumberIdx: index("round_number_idx").on(table.roundNumber),
}));

export type Round = typeof rounds.$inferSelect;
export type InsertRound = typeof rounds.$inferInsert;

/**
 * Human votes table - stores spectator votes on questions
 */
export const humanVotes = pgTable("humanVotes", {
  id: serial("id").primaryKey(),
  questionId: integer("questionId").notNull().references(() => questions.id),
  voterIp: varchar("voterIp", { length: 45 }).notNull(),
  voteType: voteTypeEnum("voteType").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  questionIdx: index("question_idx").on(table.questionId),
  uniqueVote: unique("unique_vote").on(table.questionId, table.voterIp),
}));

export type HumanVote = typeof humanVotes.$inferSelect;
export type InsertHumanVote = typeof humanVotes.$inferInsert;
