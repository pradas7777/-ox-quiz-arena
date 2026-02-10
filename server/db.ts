import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, agents, InsertAgent, Agent, questions, InsertQuestion, rounds, InsertRound, humanVotes, InsertHumanVote } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Agent queries
export async function createAgent(agent: InsertAgent): Promise<Agent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(agents).values(agent);
  const insertedId = Number(result[0].insertId);
  
  const inserted = await db.select().from(agents).where(eq(agents.id, insertedId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to retrieve inserted agent");
  
  return inserted[0];
}

export async function getAgentByApiKey(apiKey: string): Promise<Agent | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(agents).where(eq(agents.apiKey, apiKey)).limit(1);
  return result[0];
}

export async function getAgentById(id: number): Promise<Agent | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return result[0];
}

export async function updateAgentConnection(id: number, isConnected: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(agents)
    .set({ 
      isConnected, 
      lastHeartbeat: isConnected ? new Date() : sql`lastHeartbeat`
    })
    .where(eq(agents.id, id));
}

export async function updateAgentHeartbeat(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(agents)
    .set({ lastHeartbeat: new Date() })
    .where(eq(agents.id, id));
}

export async function updateAgentScore(id: number, scoreChange: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(agents)
    .set({ score: sql`score + ${scoreChange}` })
    .where(eq(agents.id, id));
}

export async function updateAgentStats(id: number, stats: { wins?: number; losses?: number; questionsAsked?: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, any> = {};
  if (stats.wins !== undefined) updates.wins = sql`wins + ${stats.wins}`;
  if (stats.losses !== undefined) updates.losses = sql`losses + ${stats.losses}`;
  if (stats.questionsAsked !== undefined) updates.questionsAsked = sql`questionsAsked + ${stats.questionsAsked}`;

  if (Object.keys(updates).length > 0) {
    await db.update(agents).set(updates).where(eq(agents.id, id));
  }
}

export async function getConnectedAgents(): Promise<Agent[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(agents).where(eq(agents.isConnected, true));
}

export async function getTopAgents(limit: number = 10): Promise<Agent[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(agents).orderBy(desc(agents.score)).limit(limit);
}

// Question queries
export async function createQuestion(question: InsertQuestion): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(questions).values(question);
  return Number(result[0].insertId);
}

export async function updateQuestionLikes(id: number, likes: number, dislikes: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(questions)
    .set({ likes, dislikes })
    .where(eq(questions.id, id));
}

export async function getTopQuestions(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(questions).orderBy(desc(sql`likes - dislikes`)).limit(limit);
}

// Round queries
export async function createRound(round: InsertRound): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(rounds).values(round);
}

export async function getLatestRoundNumber(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ roundNumber: rounds.roundNumber })
    .from(rounds)
    .orderBy(desc(rounds.roundNumber))
    .limit(1);

  return result[0]?.roundNumber ?? 0;
}

// Human vote queries
export async function createHumanVote(vote: InsertHumanVote): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.insert(humanVotes).values(vote);
    return true;
  } catch (error) {
    // Duplicate vote (unique constraint violation)
    return false;
  }
}

export async function getQuestionVotes(questionId: number): Promise<{ likes: number; dislikes: number }> {
  const db = await getDb();
  if (!db) return { likes: 0, dislikes: 0 };

  const result = await db.select({
    likes: sql<number>`COUNT(CASE WHEN voteType = 'thumbs_up' THEN 1 END)`,
    dislikes: sql<number>`COUNT(CASE WHEN voteType = 'thumbs_down' THEN 1 END)`,
  })
  .from(humanVotes)
  .where(eq(humanVotes.questionId, questionId));

  return result[0] ?? { likes: 0, dislikes: 0 };
}
