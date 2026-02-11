import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** 개발 모드에서 OAuth 없이 Admin 접근용 가상 사용자 */
function getDevAdminUser(): User {
  const now = new Date();
  return {
    id: 0,
    openId: "dev-admin",
    name: "Dev Admin",
    email: null,
    loginMethod: null,
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  // 개발 모드: 로그인 없으면 가상 admin 사용자로 Admin 접근 가능
  if (!user && !ENV.isProduction) {
    user = getDevAdminUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
