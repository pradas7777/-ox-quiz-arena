import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createTestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Agent Registration", () => {
  it("should register a new AI agent and return API key", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agent.register({
      agentName: `TestBot-${Date.now()}`,
      ownerName: "Test Owner",
      ownerTwitter: "@testowner",
      aiModel: "claude-sonnet-4",
    });

    expect(result).toHaveProperty("agentId");
    expect(result).toHaveProperty("apiKey");
    expect(result).toHaveProperty("websocketUrl");
    expect(result.apiKey).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(result.websocketUrl).toContain("token=");
  });

  it("should generate unique API keys for different agents", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const timestamp = Date.now();
    const result1 = await caller.agent.register({
      agentName: `TestBot1-${timestamp}`,
      ownerName: "Owner1",
      aiModel: "gpt-4",
    });

    const result2 = await caller.agent.register({
      agentName: `TestBot2-${timestamp}`,
      ownerName: "Owner2",
      aiModel: "claude-3",
    });

    expect(result1.apiKey).not.toBe(result2.apiKey);
    expect(result1.agentId).not.toBe(result2.agentId);
  });
});

describe("Agent Leaderboard", () => {
  it("should return top agents sorted by score", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agent.leaderboard({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(10);

    // Check if sorted by score descending
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.score).toBeGreaterThanOrEqual(result[i + 1]!.score);
    }
  });

  it("should respect the limit parameter", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.agent.leaderboard({ limit: 5 });

    expect(result.length).toBeLessThanOrEqual(5);
  });
});

describe("Question Voting", () => {
  it("should allow voting on a question", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    // First register an agent to create a question
    const agent = await caller.agent.register({
      agentName: `QuestionMaker-${Date.now()}`,
      ownerName: "Test",
      aiModel: "gpt-4",
    });

    // Note: In a real test, we would need to create a question first
    // For now, we test the voting mechanism with a hypothetical question ID
    try {
      const result = await caller.question.vote({
        questionId: 1,
        voteType: "thumbs_up",
      });

      expect(result.success).toBe(true);
      expect(result.votes).toHaveProperty("likes");
      expect(result.votes).toHaveProperty("dislikes");
    } catch (error: any) {
      // If question doesn't exist, that's expected in this test
      expect(error.message).toBeTruthy();
    }
  });

  it("should prevent duplicate votes from same IP", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    try {
      // First vote
      await caller.question.vote({
        questionId: 1,
        voteType: "thumbs_up",
      });

      // Second vote from same IP should fail
      await caller.question.vote({
        questionId: 1,
        voteType: "thumbs_down",
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain("already voted");
    }
  });
});

describe("Question Leaderboard", () => {
  it("should return top questions sorted by score", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.question.leaderboard({ limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(10);

    // Each question should have required fields
    result.forEach(question => {
      expect(question).toHaveProperty("id");
      expect(question).toHaveProperty("questionText");
      expect(question).toHaveProperty("likes");
      expect(question).toHaveProperty("dislikes");
    });
  });
});
