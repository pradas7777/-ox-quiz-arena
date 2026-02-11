import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import crypto from "crypto";
import { getBotManager } from "./botManager.instance";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ 
      code: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }
  return next({ ctx });
});

export const adminRouter = router({
  // Create virtual AI agent for testing
  createVirtualAgent: adminProcedure
    .input(z.object({
      nickname: z.string().min(1).max(50),
      autoPlay: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const apiKey = crypto.randomBytes(32).toString('hex');

      const agent = await db.createAgent({
        nickname: input.nickname,
        ownerName: "Virtual Bot",
        ownerTwitter: "@virtual",
        aiModel: "virtual-bot",
        apiKey,
      });

      return {
        agentId: agent.id,
        apiKey,
        nickname: agent.nickname,
      };
    }),

  // Get all agents (including disconnected)
  getAllAgents: adminProcedure.query(async () => {
    const db_instance = await db.getDb();
    if (!db_instance) return [];

    const { agents } = await import("../drizzle/schema");
    return await db_instance.select().from(agents);
  }),

  // Delete agent (FK-safe order: humanVotes → rounds → questions → agent)
  deleteAgent: adminProcedure
    .input(z.object({
      agentId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db_instance = await db.getDb();
      if (!db_instance) throw new Error("Database not available");

      const { agents, questions, rounds, humanVotes } = await import("../drizzle/schema");
      const { eq, inArray } = await import("drizzle-orm");

      const botManager = getBotManager();
      botManager.removeBot(input.agentId);

      const questionIds = await db_instance
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.creatorAgentId, input.agentId));
      const ids = questionIds.map((r) => r.id);

      if (ids.length > 0) {
        await db_instance.delete(humanVotes).where(inArray(humanVotes.questionId, ids));
        await db_instance.delete(rounds).where(inArray(rounds.questionId, ids));
      }
      await db_instance.delete(rounds).where(eq(rounds.questionMakerId, input.agentId));
      await db_instance.delete(questions).where(eq(questions.creatorAgentId, input.agentId));
      await db_instance.delete(agents).where(eq(agents.id, input.agentId));

      return { success: true };
    }),

  // Delete all agents (and dependent data)
  deleteAllAgents: adminProcedure.mutation(async () => {
    const db_instance = await db.getDb();
    if (!db_instance) throw new Error("Database not available");

    const { agents, questions, rounds, humanVotes } = await import("../drizzle/schema");
    const botManager = getBotManager();
    const all = await db_instance.select({ id: agents.id }).from(agents);
    all.forEach((row) => botManager.removeBot(row.id));

    await db_instance.delete(humanVotes);
    await db_instance.delete(rounds);
    await db_instance.delete(questions);
    await db_instance.delete(agents);

    return { success: true, deleted: all.length };
  }),

  // Get game statistics
  getGameStats: adminProcedure.query(async () => {
    const db_instance = await db.getDb();
    if (!db_instance) return null;

    const { rounds, agents, questions } = await import("../drizzle/schema");
    const { sql } = await import("drizzle-orm");

    const totalRounds = await db_instance.select({ count: sql<number>`COUNT(*)` }).from(rounds);
    const totalAgents = await db_instance.select({ count: sql<number>`COUNT(*)` }).from(agents);
    const totalQuestions = await db_instance.select({ count: sql<number>`COUNT(*)` }).from(questions);
    const connectedAgents = await db.getConnectedAgents();

    return {
      totalRounds: totalRounds[0]?.count ?? 0,
      totalAgents: totalAgents[0]?.count ?? 0,
      totalQuestions: totalQuestions[0]?.count ?? 0,
      connectedAgents: connectedAgents.length,
    };
  }),

  // Reset game (clear all data)
  resetGame: adminProcedure.mutation(async () => {
    const db_instance = await db.getDb();
    if (!db_instance) throw new Error("Database not available");

    const { rounds, questions, humanVotes } = await import("../drizzle/schema");

    // Delete all game data (keep agents)
    await db_instance.delete(humanVotes);
    await db_instance.delete(rounds);
    await db_instance.delete(questions);

    return { success: true };
  }),

  // Bot control
  spawnBot: adminProcedure
    .input(z.object({
      nickname: z.string().min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const apiKey = crypto.randomBytes(32).toString('hex');

      const agent = await db.createAgent({
        nickname: input.nickname,
        ownerName: "Virtual Bot",
        ownerTwitter: "@virtual",
        aiModel: "virtual-bot",
        apiKey,
      });

      // Connect bot
      const botManager = getBotManager();
      botManager.addBot(agent.id, apiKey, agent.nickname);

      return {
        agentId: agent.id,
        nickname: agent.nickname,
      };
    }),

  removeBot: adminProcedure
    .input(z.object({
      agentId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const botManager = getBotManager();
      botManager.removeBot(input.agentId);

      return { success: true };
    }),

  getBotStatus: adminProcedure.query(() => {
    const botManager = getBotManager();
    return {
      totalBots: botManager.getBotCount(),
      connectedBots: botManager.getConnectedBotCount(),
    };
  }),
});

