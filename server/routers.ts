import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import crypto from "crypto";
import { adminRouter } from "./adminRouter";

const ADMIN_PASSWORD_OPEN_ID = "admin-password";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    /** 관리자 비밀번호로 로그인 (ADMIN_PASSWORD 환경변수 설정 필요). */
    adminLogin: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ENV.adminPassword) {
          throw new Error("Admin password login is not configured. Set ADMIN_PASSWORD in server .env.");
        }
        if (input.password !== ENV.adminPassword) {
          throw new Error("Invalid admin password.");
        }
        const database = await db.getDb();
        if (!database) {
          throw new Error("Database not available. Set DATABASE_URL in server .env.");
        }
        await db.upsertUser({
          openId: ADMIN_PASSWORD_OPEN_ID,
          name: "Admin",
          email: null,
          loginMethod: "admin-password",
          role: "admin",
          lastSignedIn: new Date(),
        });
        const sessionToken = await sdk.createSessionToken(ADMIN_PASSWORD_OPEN_ID, {
          name: "Admin",
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true } as const;
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

  game: router({
    getRoundHistory: publicProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(20),
      }).optional())
      .query(async ({ input }) => {
        return await db.getRoundHistory(input?.limit || 20);
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
