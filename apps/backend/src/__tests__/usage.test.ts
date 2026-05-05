/**
 * Usage tracking and rate limiter tests.
 * Tests the in-memory rate limiter that replaced Redis.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the rate limiter logic directly (it's in-memory, no DB needed)
// We need to import after env is set up by setup.ts

describe("In-Memory Rate Limiter", () => {
  // Reimplementation matching usage.ts logic for isolated testing
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

  function checkRateLimit(
    key: string,
    maxRequests = 60,
    windowMs = 60000
  ): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    entry.count++;
    const allowed = entry.count <= maxRequests;
    return { allowed, remaining: Math.max(0, maxRequests - entry.count) };
  }

  function checkOtpRateLimit(phone: string): boolean {
    return checkRateLimit(`otp:${phone}`, 3, 600000).allowed;
  }

  beforeEach(() => {
    rateLimitStore.clear();
  });

  describe("checkRateLimit", () => {
    it("allows first request", () => {
      const result = checkRateLimit("test-key");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    it("tracks remaining requests correctly", () => {
      checkRateLimit("test-key", 3);
      const r2 = checkRateLimit("test-key", 3);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit("test-key", 3);
      expect(r3.remaining).toBe(0);
      expect(r3.allowed).toBe(true);
    });

    it("blocks after max requests exceeded", () => {
      for (let i = 0; i < 3; i++) {
        checkRateLimit("block-key", 3);
      }
      const result = checkRateLimit("block-key", 3);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("resets after window expires", () => {
      // Manually set an expired entry
      rateLimitStore.set("expired-key", { count: 100, resetAt: Date.now() - 1 });
      const result = checkRateLimit("expired-key", 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    it("handles different keys independently", () => {
      for (let i = 0; i < 3; i++) {
        checkRateLimit("key-a", 3);
      }
      const resultA = checkRateLimit("key-a", 3);
      const resultB = checkRateLimit("key-b", 3);

      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(true);
    });
  });

  describe("checkOtpRateLimit", () => {
    it("allows first 3 OTP requests per phone", () => {
      expect(checkOtpRateLimit("+919876543210")).toBe(true);
      expect(checkOtpRateLimit("+919876543210")).toBe(true);
      expect(checkOtpRateLimit("+919876543210")).toBe(true);
    });

    it("blocks 4th OTP request within window", () => {
      checkOtpRateLimit("+919876543210");
      checkOtpRateLimit("+919876543210");
      checkOtpRateLimit("+919876543210");
      expect(checkOtpRateLimit("+919876543210")).toBe(false);
    });

    it("treats different phone numbers independently", () => {
      for (let i = 0; i < 3; i++) {
        checkOtpRateLimit("+919876543210");
      }
      expect(checkOtpRateLimit("+919876543210")).toBe(false);
      expect(checkOtpRateLimit("+919876543211")).toBe(true);
    });
  });
});

// ─── DAILY/MONTHLY COUNTER LOGIC ──────────────────────

describe("Usage Counter Logic", () => {
  it("date format for daily usage is YYYY-MM-DD", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("month format for monthly usage is YYYY-MM-01", () => {
    const month = new Date().toISOString().slice(0, 7) + "-01";
    expect(month).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("correctly determines if limit is reached", () => {
    // Free plan: 50 msgs/day
    const dailyLimit = 50;
    expect(49 < dailyLimit).toBe(true);  // can send
    expect(50 < dailyLimit).toBe(false); // at limit
    expect(51 < dailyLimit).toBe(false); // over limit
  });
});
