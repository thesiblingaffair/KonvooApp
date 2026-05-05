import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { env } from "./config/env.js";
import { db, testDbConnection } from "./db/index.js";
import { sql } from "drizzle-orm";
import authPlugin from "./middleware/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { characterRoutes } from "./modules/characters/routes.js";
import { chatRoutes } from "./modules/chat/routes.js";
import { paymentRoutes } from "./modules/payments/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import notificationRoutes from "./modules/notifications/notification_routes.js";
import { telegramRoutes } from "./modules/telegram/routes.js";

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    transport: env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
  },
  trustProxy: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB — voice notes can be several MB
});

await fastify.register(cors, { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","), credentials: true });
await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS });
await fastify.register(jwt, { secret: env.JWT_SECRET });
await fastify.register(authPlugin);

fastify.get("/health", async () => {
  let dbOk = false;
  try { await db.execute(sql`SELECT 1`); dbOk = true; } catch (e) {}
  return { status: "ok", db: dbOk ? "connected" : "timeout", timestamp: new Date().toISOString(), version: "2.0.0" };
});
fastify.get("/", async () => ({ name: "Konvoo API", status: "ok" }));

await fastify.register(async function apiV1(app) {
  await app.register(authRoutes);
  await app.register(characterRoutes);
  await app.register(chatRoutes);
  await app.register(paymentRoutes);
  await app.register(userRoutes);
  await app.register(notificationRoutes);
}, { prefix: "/api/v1" });

// Telegram webhook — registered at root level (not under /api/v1)
await fastify.register(telegramRoutes);

fastify.setErrorHandler((error: any, _request, reply) => {
  if (error.name === "ZodError") return reply.status(400).send({ error: "Validation failed", code: "VALIDATION_ERROR", details: (error as any).issues });
  if (error.statusCode === 429) return reply.status(429).send({ error: "Too many requests", code: "RATE_LIMITED" });
  fastify.log.error(error);
  return reply.status(error.statusCode || 500).send({ error: env.NODE_ENV === "production" ? "Internal server error" : error.message, code: "INTERNAL_ERROR" });
});

fastify.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: "Route not found", code: "NOT_FOUND" }));

async function start() {
  console.log("\n🚀 Starting Konvoo Backend v2 (Supabase Edition)...\n");
  await testDbConnection();
  await fastify.listen({ port: env.PORT, host: env.HOST });

  // Self-ping to prevent Render free tier from sleeping (backup for external cron)
  setInterval(() => {
    fetch(`http://localhost:${env.PORT}/health`).catch(() => {});
  }, 10 * 60 * 1000); // every 10 minutes

  // Keep Supabase connection pool warm — prevents cold start timeouts
  setInterval(async () => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch (e) {
      console.warn("⚠️ Supabase keep-alive ping failed:", (e as Error).message);
    }
  }, 4 * 60 * 1000); // every 4 minutes

  console.log(`\n✅ Konvoo API running at http://${env.HOST}:${env.PORT}`);
  console.log(`   Stack: Supabase + OpenRouter + Render`);
  console.log(`   Health: http://localhost:${env.PORT}/health`);
  console.log(`   Self-ping: every 10 minutes\n`);
}

process.on("SIGINT", async () => { await fastify.close(); process.exit(0); });
process.on("SIGTERM", async () => { await fastify.close(); process.exit(0); });

start();
