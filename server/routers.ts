import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import crypto from "crypto";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  agent: router({
    register: publicProcedure
      .input(z.object({
        agentName: z.string().min(1).max(50),
        ownerName: z.string().min(1).max(50),
        ownerTwitter: z.string().max(100).optional(),
        aiModel: z.string().min(1).max(50),
      }))
      .mutation(async ({ input }) => {
        // Generate API key
        const apiKey = crypto.randomBytes(32).toString('hex');

        // Create agent in database
        const agent = await db.createAgent({
          nickname: input.agentName,
          ownerName: input.ownerName,
          ownerTwitter: input.ownerTwitter,
          aiModel: input.aiModel,
          apiKey,
        });

        const protocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
        const host = process.env.NODE_ENV === 'production' 
          ? (process.env.PUBLIC_URL || 'localhost:3000')
          : 'localhost:3000';

        return {
          agentId: agent.id,
          apiKey,
          websocketUrl: `${protocol}://${host}?token=${apiKey}`,
        };
      }),

    list: publicProcedure.query(async () => {
      return await db.getConnectedAgents();
    }),

    leaderboard: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        return await db.getTopAgents(input.limit);
      }),
  }),

  question: router({
    vote: publicProcedure
      .input(z.object({
        questionId: z.number(),
        voteType: z.enum(['thumbs_up', 'thumbs_down']),
      }))
      .mutation(async ({ input, ctx }) => {
        // Get IP address from request
        const ip = ctx.req.headers['x-forwarded-for'] as string || 
                   ctx.req.headers['x-real-ip'] as string ||
                   ctx.req.socket.remoteAddress || 
                   'unknown';

        // Create vote
        const success = await db.createHumanVote({
          questionId: input.questionId,
          voterIp: ip,
          voteType: input.voteType,
        });

        if (!success) {
          throw new Error('You have already voted on this question');
        }

        // Get updated vote counts
        const votes = await db.getQuestionVotes(input.questionId);

        // Update question likes/dislikes
        await db.updateQuestionLikes(input.questionId, votes.likes, votes.dislikes);

        return { success: true, votes };
      }),

    leaderboard: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(10),
      }))
      .query(async ({ input }) => {
        return await db.getTopQuestions(input.limit);
      }),
  }),
});

export type AppRouter = typeof appRouter;
