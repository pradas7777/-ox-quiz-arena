import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
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

function createNonAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
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

describe("Admin Access Control", () => {
  it("should allow admin to access admin endpoints", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.admin.getGameStats();
    expect(stats).toHaveProperty("totalRounds");
    expect(stats).toHaveProperty("totalAgents");
    expect(stats).toHaveProperty("totalQuestions");
    expect(stats).toHaveProperty("connectedAgents");
  });

  it("should deny non-admin access to admin endpoints", async () => {
    const ctx = createNonAdminContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.getGameStats()).rejects.toThrow("Admin access required");
  });
});

describe("Virtual Bot Management", () => {
  it("should spawn a virtual bot", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const nickname = `TestBot-Vitest-${Date.now()}`;
    const result = await caller.admin.spawnBot({
      nickname,
    });

    expect(result).toHaveProperty("agentId");
    expect(result).toHaveProperty("nickname");
    expect(result.nickname).toBe(nickname);
  });

  it("should get bot status", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const status = await caller.admin.getBotStatus();

    expect(status).toHaveProperty("totalBots");
    expect(status).toHaveProperty("connectedBots");
    expect(typeof status.totalBots).toBe("number");
    expect(typeof status.connectedBots).toBe("number");
  });
});

describe("Game Statistics", () => {
  it("should return game statistics", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.admin.getGameStats();

    expect(typeof stats.totalRounds).toBe("number");
    expect(typeof stats.totalAgents).toBe("number");
    expect(typeof stats.totalQuestions).toBe("number");
    expect(typeof stats.connectedAgents).toBe("number");
  });

  it("should list all agents", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const agents = await caller.admin.getAllAgents();

    expect(Array.isArray(agents)).toBe(true);
    
    if (agents.length > 0) {
      const agent = agents[0];
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("nickname");
      expect(agent).toHaveProperty("score");
    }
  });
});
