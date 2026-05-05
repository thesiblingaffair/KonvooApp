/**
 * Server integration tests.
 * Tests: health check, root endpoint, 404 handler, error shapes.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTestApp } from "./helpers.js";
import type { FastifyInstance } from "fastify";

describe("Server Endpoints", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();

    // Register the same root-level routes as server.ts
    app.get("/health", async () => ({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
    }));

    app.get("/", async () => ({
      name: "Yaari API",
      version: "2.0.0",
      stack: "Supabase + OpenAI + Render",
    }));

    // Custom error handler matching server.ts
    app.setErrorHandler((error, _request, reply) => {
      if (error.name === "ZodError") {
        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: (error as any).issues,
        });
      }
      if (error.statusCode === 429) {
        return reply.status(429).send({
          error: "Too many requests",
          code: "RATE_LIMITED",
        });
      }
      return reply.status(error.statusCode || 500).send({
        error: error.message,
        code: "INTERNAL_ERROR",
      });
    });

    app.setNotFoundHandler((_request, reply) => {
      reply.status(404).send({ error: "Route not found", code: "NOT_FOUND" });
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns status ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe("2.0.0");
      expect(body.timestamp).toBeDefined();
    });

    it("returns valid ISO timestamp", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      const body = res.json();
      const parsed = new Date(body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  describe("GET /", () => {
    it("returns API info", async () => {
      const res = await app.inject({ method: "GET", url: "/" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe("Yaari API");
      expect(body.stack).toContain("Supabase");
    });
  });

  describe("404 Handler", () => {
    it("returns NOT_FOUND for unknown routes", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("NOT_FOUND");
    });

    it("returns 404 for wrong HTTP methods", async () => {
      const res = await app.inject({ method: "DELETE", url: "/health" });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ─── AUTH MIDDLEWARE ───────────────────────────────────

describe("Auth Middleware", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();

    // Protected test route
    app.get("/protected", {
      preHandler: [(app as any).authenticate],
      handler: async (request: any, reply) => {
        return reply.send({ userId: request.userId });
      },
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects request with no Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("rejects request with malformed Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic abc123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("rejects request with invalid JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer invalid.jwt.token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("TOKEN_INVALID");
  });

  it("accepts request with valid JWT and sets userId", async () => {
    const token = app.jwt.sign({ userId: "user-123", phone: "+919876543210" }, { expiresIn: "15m" });
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe("user-123");
  });

  it("rejects expired JWT", async () => {
    const token = app.jwt.sign(
      { userId: "user-123", phone: "+919876543210" },
      { expiresIn: "0s" } // expires immediately
    );
    // Small delay to ensure token is expired
    await new Promise(resolve => setTimeout(resolve, 100));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
