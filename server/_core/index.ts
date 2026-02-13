import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, "..", ".env") });
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { getSessionCookieOptions } from "./cookies";
import * as db from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupSocketServer } from "../socketServer";

const ADMIN_PASSWORD_OPEN_ID = "admin-password";

function registerAdminLoginRoute(app: express.Express) {
  app.post("/api/admin-login", async (req, res) => {
    try {
      const password = (typeof req.body?.password === "string" ? req.body.password : "").trim();
      const expected = (ENV.adminPassword ?? "").trim();
      if (!expected) {
        res.status(400).json({ ok: false, error: "Admin password login is not configured. Set ADMIN_PASSWORD in server .env (or project root .env)." });
        return;
      }
      if (!password || password !== expected) {
        res.status(401).json({ ok: false, error: "Invalid admin password." });
        return;
      }
      const database = await db.getDb();
      if (!database) {
        res.status(503).json({ ok: false, error: "Database not available. Set DATABASE_URL in server .env." });
        return;
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
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.status(200).json({ ok: true, success: true });
    } catch (e) {
      console.error("[admin-login]", e);
      res.status(500).json({ ok: false, error: String(e) });
    }
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  registerAdminLoginRoute(app);
  if (!ENV.adminPassword) {
    console.warn("[admin-login] ADMIN_PASSWORD is not set. Add ADMIN_PASSWORD=your_password to server/.env or project root .env and restart.");
  }
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Setup Socket.IO server
  await setupSocketServer(server);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
