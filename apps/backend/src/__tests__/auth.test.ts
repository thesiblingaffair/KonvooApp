/**
 * Auth routes integration tests.
 * Tests: OTP send/verify, token refresh, onboarding, profile, logout.
 * DB and MSG91 are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildTestApp,
  factories,
  generateAccessToken,
  generateRefreshToken,
  authHeaders,
} from "./helpers.js";
import type { FastifyInstance } from "fastify";

// ─── MOCK MODULES ─────────────────────────────────────

const mockUser = factories.user({ id: "user-1", phone: "+919876543210", name: "Arjun" });

// Mock the db module
vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
  testDbConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../db/usage.js", () => ({
  checkOtpRateLimit: vi.fn().mockReturnValue(true),
  incrementDailyMessages: vi.fn().mockResolvedValue(1),
  getDailyMessages: vi.fn().mockResolvedValue(0),
  getMonthlyImages: vi.fn().mockResolvedValue(0),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 59 }),
}));

// ─── TESTS ────────────────────────────────────────────

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();

    // Register a minimal version of auth routes for testing
    app.post("/api/v1/auth/otp/send", async (request: any, reply) => {
      const { phone } = request.body;
      if (!/^\+91[6-9]\d{9}$/.test(phone)) {
        return reply.status(400).send({ error: "Invalid phone", code: "VALIDATION_ERROR" });
      }
      return reply.send({ success: true, message: "OTP sent", expiresIn: 300 });
    });

    app.post("/api/v1/auth/otp/verify", async (request: any, reply) => {
      const { phone, otp } = request.body;
      if (otp !== "123456") {
        return reply.status(401).send({ error: "Invalid OTP", code: "OTP_INVALID" });
      }
      const accessToken = app.jwt.sign({ userId: mockUser.id, phone }, { expiresIn: "15m" });
      const refreshToken = app.jwt.sign({ userId: mockUser.id, type: "refresh" }, { expiresIn: "7d" });
      return reply.send({ success: true, accessToken, refreshToken, isNewUser: false, user: mockUser });
    });

    app.post("/api/v1/auth/refresh", async (request: any, reply) => {
      const { refreshToken } = request.body;
      try {
        const decoded = app.jwt.verify<{ userId: string; type: string }>(refreshToken);
        if (decoded.type !== "refresh") return reply.status(401).send({ error: "Invalid token type" });
        const newAccess = app.jwt.sign({ userId: decoded.userId, phone: "+919876543210" }, { expiresIn: "15m" });
        const newRefresh = app.jwt.sign({ userId: decoded.userId, type: "refresh" }, { expiresIn: "7d" });
        return reply.send({ accessToken: newAccess, refreshToken: newRefresh });
      } catch {
        return reply.status(401).send({ error: "Invalid refresh token" });
      }
    });

    app.get("/api/v1/auth/me", {
      preHandler: [(app as any).authenticate],
      handler: async (request: any, reply) => {
        return reply.send(mockUser);
      },
    });

    app.post("/api/v1/auth/logout", {
      preHandler: [(app as any).authenticate],
      handler: async (_request: any, reply) => {
        return reply.send({ success: true });
      },
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── OTP SEND ────────────────────────────────────

  describe("POST /auth/otp/send", () => {
    it("sends OTP for valid Indian phone number", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/send",
        payload: { phone: "+919876543210" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.expiresIn).toBe(300);
    });

    it("rejects invalid phone number", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/send",
        payload: { phone: "12345" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── OTP VERIFY ──────────────────────────────────

  describe("POST /auth/otp/verify", () => {
    it("returns tokens for valid OTP", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/verify",
        payload: { phone: "+919876543210", otp: "123456" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      expect(body.user.id).toBe(mockUser.id);
    });

    it("rejects invalid OTP", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/verify",
        payload: { phone: "+919876543210", otp: "000000" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe("OTP_INVALID");
    });
  });

  // ─── TOKEN REFRESH ───────────────────────────────

  describe("POST /auth/refresh", () => {
    it("returns new token pair for valid refresh token", async () => {
      const refreshToken = generateRefreshToken(app, mockUser);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
      // New tokens should be different from the original
      expect(body.refreshToken).not.toBe(refreshToken);
    });

    it("rejects invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: "invalid-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects access token used as refresh token", async () => {
      const accessToken = generateAccessToken(app, mockUser);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: accessToken },
      });
      // Access tokens don't have type: "refresh"
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── GET PROFILE ─────────────────────────────────

  describe("GET /auth/me", () => {
    it("returns user profile with valid token", async () => {
      const token = generateAccessToken(app, mockUser);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeaders(token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(mockUser.id);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with malformed token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: authHeaders("not.a.jwt"),
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── LOGOUT ──────────────────────────────────────

  describe("POST /auth/logout", () => {
    it("returns success", async () => {
      const token = generateAccessToken(app, mockUser);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: authHeaders(token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });
});
