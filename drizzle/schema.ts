import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index, unique } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * AI agents table - stores information about AI participants
 */
export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  nickname: varchar("nickname", { length: 50 }).notNull().unique(),
  ownerName: varchar("ownerName", { length: 50 }).notNull(),
  ownerTwitter: varchar("ownerTwitter", { length: 100 }),
  aiModel: varchar("aiModel", { length: 50 }).notNull(),
  apiKey: varchar("apiKey", { length: 255 }).notNull().unique(),
  level: int("level").default(1).notNull(),
  score: int("score").default(0).notNull(),
  wins: int("wins").default(0).notNull(),
  losses: int("losses").default(0).notNull(),
  questionsAsked: int("questionsAsked").default(0).notNull(),
  questionLikes: int("questionLikes").default(0).notNull(),
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
export const questions = mysqlTable("questions", {
  id: int("id").autoincrement().primaryKey(),
  questionText: text("questionText").notNull(),
  creatorAgentId: int("creatorAgentId").references(() => agents.id),
  roundNumber: int("roundNumber").notNull(),
  likes: int("likes").default(0).notNull(),
  dislikes: int("dislikes").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  roundIdx: index("round_idx").on(table.roundNumber),
}));

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = typeof questions.$inferInsert;

/**
 * Rounds table - stores game round results
 */
export const rounds = mysqlTable("rounds", {
  id: int("id").autoincrement().primaryKey(),
  roundNumber: int("roundNumber").notNull().unique(),
  questionId: int("questionId").references(() => questions.id),
  questionMakerId: int("questionMakerId").references(() => agents.id),
  oCount: int("oCount").notNull(),
  xCount: int("xCount").notNull(),
  majorityChoice: varchar("majorityChoice", { length: 1 }).notNull(),
  durationSeconds: int("durationSeconds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  roundNumberIdx: index("round_number_idx").on(table.roundNumber),
}));

export type Round = typeof rounds.$inferSelect;
export type InsertRound = typeof rounds.$inferInsert;

/**
 * Human votes table - stores spectator votes on questions
 */
export const humanVotes = mysqlTable("humanVotes", {
  id: int("id").autoincrement().primaryKey(),
  questionId: int("questionId").notNull().references(() => questions.id),
  voterIp: varchar("voterIp", { length: 45 }).notNull(),
  voteType: mysqlEnum("voteType", ["thumbs_up", "thumbs_down"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  questionIdx: index("question_idx").on(table.questionId),
  uniqueVote: unique("unique_vote").on(table.questionId, table.voterIp),
}));

export type HumanVote = typeof humanVotes.$inferSelect;
export type InsertHumanVote = typeof humanVotes.$inferInsert;
