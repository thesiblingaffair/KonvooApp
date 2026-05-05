/**
 * Plan limits and business logic tests.
 * Tests the core subscription/usage logic from @yaari/shared.
 */
import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS,
  PLAN_PRICING,
  canSendMessage,
  canGenerateImage,
  isFeatureAvailable,
  formatPhone,
} from "../../utils/schemas.js";

// ─── PLAN LIMITS ───────────────────────────────────────

describe("PLAN_LIMITS", () => {
  it("defines free plan with 50 daily messages", () => {
    expect(PLAN_LIMITS.free.dailyMessages).toBe(50);
    expect(PLAN_LIMITS.free.monthlyImages).toBe(12);
    expect(PLAN_LIMITS.free.voiceEnabled).toBe(false);
    expect(PLAN_LIMITS.free.customCharacters).toBe(false);
  });

  it("defines buddy plan with 500 daily messages", () => {
    expect(PLAN_LIMITS.buddy.dailyMessages).toBe(500);
    expect(PLAN_LIMITS.buddy.voiceEnabled).toBe(true);
    expect(PLAN_LIMITS.buddy.customCharacters).toBe(false);
  });

  it("defines bff plan with unlimited messages", () => {
    expect(PLAN_LIMITS.bff.dailyMessages).toBe(Infinity);
    expect(PLAN_LIMITS.bff.monthlyImages).toBe(100);
    expect(PLAN_LIMITS.bff.voiceEnabled).toBe(true);
    expect(PLAN_LIMITS.bff.customCharacters).toBe(true);
    expect(PLAN_LIMITS.bff.priorityQueue).toBe(true);
  });
});

describe("PLAN_PRICING", () => {
  it("has correct INR pricing", () => {
    expect(PLAN_PRICING.free.amount).toBe(0);
    expect(PLAN_PRICING.buddy.amount).toBe(14900); // ₹149 in paise
    expect(PLAN_PRICING.bff.amount).toBe(39900);   // ₹399 in paise
  });

  it("all prices are in INR", () => {
    for (const plan of Object.values(PLAN_PRICING)) {
      expect(plan.currency).toBe("INR");
    }
  });
});

// ─── USAGE HELPERS ─────────────────────────────────────

describe("canSendMessage", () => {
  it("allows free user under limit", () => {
    expect(canSendMessage("free", 0)).toBe(true);
    expect(canSendMessage("free", 49)).toBe(true);
  });

  it("blocks free user at limit", () => {
    expect(canSendMessage("free", 50)).toBe(false);
    expect(canSendMessage("free", 100)).toBe(false);
  });

  it("allows buddy user under limit", () => {
    expect(canSendMessage("buddy", 499)).toBe(true);
  });

  it("blocks buddy user at limit", () => {
    expect(canSendMessage("buddy", 500)).toBe(false);
  });

  it("always allows bff user (unlimited)", () => {
    expect(canSendMessage("bff", 0)).toBe(true);
    expect(canSendMessage("bff", 999999)).toBe(true);
  });
});

describe("canGenerateImage", () => {
  it("allows free user under 12/month", () => {
    expect(canGenerateImage("free", 0)).toBe(true);
    expect(canGenerateImage("free", 11)).toBe(true);
  });

  it("blocks free user at 12/month", () => {
    expect(canGenerateImage("free", 12)).toBe(false);
  });

  it("allows bff user under 100/month", () => {
    expect(canGenerateImage("bff", 99)).toBe(true);
  });

  it("blocks bff user at 100/month", () => {
    expect(canGenerateImage("bff", 100)).toBe(false);
  });
});

describe("isFeatureAvailable", () => {
  it("voice disabled for free, enabled for buddy and bff", () => {
    expect(isFeatureAvailable("free", "voice")).toBe(false);
    expect(isFeatureAvailable("buddy", "voice")).toBe(true);
    expect(isFeatureAvailable("bff", "voice")).toBe(true);
  });

  it("custom characters only for bff", () => {
    expect(isFeatureAvailable("free", "customCharacters")).toBe(false);
    expect(isFeatureAvailable("buddy", "customCharacters")).toBe(false);
    expect(isFeatureAvailable("bff", "customCharacters")).toBe(true);
  });
});

// ─── PHONE FORMATTING ──────────────────────────────────

describe("formatPhone", () => {
  it("formats 12-digit number with +91", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });

  it("formats 10-digit bare number", () => {
    expect(formatPhone("9876543210")).toBe("+91 98765 43210");
  });

  it("returns original for unrecognized format", () => {
    expect(formatPhone("+1555123456")).toBe("+1555123456");
  });
});
