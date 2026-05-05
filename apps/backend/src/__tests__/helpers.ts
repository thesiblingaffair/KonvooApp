/**
 * Test helpers — builds a Fastify instance with all plugins registered,
 * provides mock data factories, and JWT token generators.
 */
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { vi } from "vitest";

// ─── MOCK DB LAYER ────────────────────────────────────
// We mock the entire db module so tests don't need PostgreSQL.

// In-memory tables
export const mockTables = {
  users: [] as any[],
  characters: [] as any[],
  conversations: [] as any[],
  messages: [] as any[],
  characterMemories: [] as any[],
  subscriptions: [] as any[],
  payments: [] as any[],
  usageDaily: [] as any[],
  usageMonthly: [] as any[],
  favorites: [] as any[],
  sessions: [] as any[],
};

export function resetMockTables() {
  for (const key of Object.keys(mockTables)) {
    (mockTables as any)[key] = [];
  }
}

// ─── FACTORY HELPERS ──────────────────────────────────

let idCounter = 0;
const uuid = () => `test-uuid-${++idCounter}`;

export const factories = {
  user: (overrides: Partial<any> = {}) => ({
    id: uuid(),
    phone: "+919876543210",
    name: "Test User",
    avatarUrl: null,
    language: "hi",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  character: (overrides: Partial<any> = {}) => ({
    id: uuid(),
    name: "Aarav",
    avatarUrl: "/avatars/aarav.webp",
    category: "college",
    personality: {
      traits: ["enthusiastic", "loyal"],
      tone: "casual",
      quirks: ["says yaar constantly"],
      speakingStyle: "Hinglish",
    },
    backstory: "A 22-year-old engineering student.",
    scenarioIntro: "You're in the hostel room at night.",
    systemPrompt: "DYNAMIC",
    isPremium: false,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    createdBy: null,
    ...overrides,
  }),

  conversation: (overrides: Partial<any> = {}) => ({
    id: uuid(),
    userId: "user-1",
    characterId: "char-1",
    lastMessage: null,
    lastAt: null,
    messageCount: 0,
    isArchived: false,
    createdAt: new Date(),
    ...overrides,
  }),

  message: (overrides: Partial<any> = {}) => ({
    id: ++idCounter,
    conversationId: "conv-1",
    role: "user",
    content: "Hello!",
    contentType: "text",
    imageUrl: null,
    voiceUrl: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  }),

  subscription: (overrides: Partial<any> = {}) => ({
    id: uuid(),
    userId: "user-1",
    plan: "buddy",
    razorpaySubId: "sub_test123",
    razorpayCustomerId: null,
    status: "active",
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
    cancelledAt: null,
    createdAt: new Date(),
    ...overrides,
  }),
};

// ─── BUILD TEST APP ───────────────────────────────────

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET! });

  // Register auth decorator
  app.decorate(
    "authenticate",
    async function (request: any, reply: any) {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({ error: "Auth required", code: "AUTH_REQUIRED" });
        }
        const token = authHeader.slice(7);
        const decoded = app.jwt.verify<{ userId: string; phone: string }>(token);
        request.userId = decoded.userId;
        request.userPhone = decoded.phone;
      } catch {
        return reply.status(401).send({ error: "Invalid token", code: "TOKEN_INVALID" });
      }
    }
  );

  return app;
}

// ─── JWT TOKEN GENERATORS ─────────────────────────────

export function generateAccessToken(app: FastifyInstance, user: any): string {
  return app.jwt.sign(
    { userId: user.id, phone: user.phone },
    { expiresIn: "15m" }
  );
}

export function generateRefreshToken(app: FastifyInstance, user: any): string {
  return app.jwt.sign(
    { userId: user.id, type: "refresh" },
    { expiresIn: "7d" }
  );
}

export function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

// ─── MOCK OPENAI RESPONSE ─────────────────────────────

export function mockOpenAiChatResponse(content: string = "Hello yaar!") {
  return {
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { completion_tokens: 50, prompt_tokens: 200, total_tokens: 250 },
  };
}

export function mockOpenAiModerationResponse(flagged: boolean = false) {
  return {
    results: [
      {
        flagged,
        categories: {
          sexual: false,
          "sexual/minors": false,
          violence: false,
          "violence/graphic": false,
          "self-harm": false,
          "self-harm/intent": false,
          harassment: flagged,
          hate: false,
        },
        category_scores: {
          sexual: 0.01,
          violence: 0.01,
          harassment: flagged ? 0.95 : 0.01,
          hate: 0.01,
        },
      },
    ],
  };
}

// ─── MOCK MSG91 ───────────────────────────────────────

export function mockMsg91Success() {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ type: "success" }),
  } as Response);
}

export function mockMsg91Failure() {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ type: "error", message: "Invalid OTP" }),
  } as Response);
}

// ─── RAZORPAY WEBHOOK SIGNATURE ───────────────────────

import crypto from "crypto";

export function generateWebhookSignature(body: string, secret: string = "webhook_test_secret"): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
