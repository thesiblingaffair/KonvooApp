/**
 * Schema validation tests — pure unit tests, no mocking needed.
 * Tests every Zod schema from @yaari/shared.
 */
import { describe, it, expect } from "vitest";
import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  onboardingSchema,
  updateProfileSchema,
  listCharactersSchema,
  startConversationSchema,
  sendMessageSchema,
  listMessagesSchema,
  createSubscriptionSchema,
  uuidParamSchema,
} from "../../utils/schemas.js";

// ─── AUTH SCHEMAS ──────────────────────────────────────

describe("sendOtpSchema", () => {
  it("accepts valid Indian phone number", () => {
    const result = sendOtpSchema.parse({ phone: "+919876543210" });
    expect(result.phone).toBe("+919876543210");
  });

  it("rejects phone without +91 prefix", () => {
    expect(() => sendOtpSchema.parse({ phone: "9876543210" })).toThrow();
  });

  it("rejects phone with invalid starting digit (0-5)", () => {
    expect(() => sendOtpSchema.parse({ phone: "+910876543210" })).toThrow();
    expect(() => sendOtpSchema.parse({ phone: "+915876543210" })).toThrow();
  });

  it("rejects phone with wrong length", () => {
    expect(() => sendOtpSchema.parse({ phone: "+9198765" })).toThrow();
    expect(() => sendOtpSchema.parse({ phone: "+9198765432100" })).toThrow();
  });

  it("rejects empty input", () => {
    expect(() => sendOtpSchema.parse({})).toThrow();
  });
});

describe("verifyOtpSchema", () => {
  it("accepts valid phone and 6-digit OTP", () => {
    const result = verifyOtpSchema.parse({ phone: "+919876543210", otp: "123456" });
    expect(result.otp).toBe("123456");
  });

  it("rejects OTP with wrong length", () => {
    expect(() => verifyOtpSchema.parse({ phone: "+919876543210", otp: "12345" })).toThrow();
    expect(() => verifyOtpSchema.parse({ phone: "+919876543210", otp: "1234567" })).toThrow();
  });

  it("rejects missing OTP", () => {
    expect(() => verifyOtpSchema.parse({ phone: "+919876543210" })).toThrow();
  });
});

describe("refreshTokenSchema", () => {
  it("accepts non-empty string", () => {
    const result = refreshTokenSchema.parse({ refreshToken: "some-token-value" });
    expect(result.refreshToken).toBe("some-token-value");
  });

  it("rejects empty string", () => {
    expect(() => refreshTokenSchema.parse({ refreshToken: "" })).toThrow();
  });
});

describe("onboardingSchema", () => {
  it("accepts valid name and language", () => {
    const result = onboardingSchema.parse({ name: "Arjun", language: "hi" });
    expect(result.name).toBe("Arjun");
    expect(result.language).toBe("hi");
  });

  it("accepts all supported languages", () => {
    const langs = ["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"];
    for (const lang of langs) {
      expect(() => onboardingSchema.parse({ name: "Test", language: lang })).not.toThrow();
    }
  });

  it("rejects unsupported language", () => {
    expect(() => onboardingSchema.parse({ name: "Test", language: "fr" })).toThrow();
  });

  it("rejects name longer than 100 chars", () => {
    expect(() => onboardingSchema.parse({ name: "a".repeat(101), language: "hi" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => onboardingSchema.parse({ name: "", language: "hi" })).toThrow();
  });
});

// ─── USER SCHEMAS ──────────────────────────────────────

describe("updateProfileSchema", () => {
  it("accepts partial updates", () => {
    expect(updateProfileSchema.parse({ name: "New Name" })).toEqual({ name: "New Name" });
    expect(updateProfileSchema.parse({ language: "ta" })).toEqual({ language: "ta" });
  });

  it("accepts empty object (no updates)", () => {
    expect(updateProfileSchema.parse({})).toEqual({});
  });

  it("rejects invalid avatar URL", () => {
    expect(() => updateProfileSchema.parse({ avatarUrl: "not-a-url" })).toThrow();
  });
});

// ─── CHARACTER SCHEMAS ─────────────────────────────────

describe("listCharactersSchema", () => {
  it("provides defaults for page and limit", () => {
    const result = listCharactersSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerces string numbers from query params", () => {
    const result = listCharactersSchema.parse({ page: "3", limit: "10" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it("rejects limit above 50", () => {
    expect(() => listCharactersSchema.parse({ limit: "100" })).toThrow();
  });

  it("rejects page below 1", () => {
    expect(() => listCharactersSchema.parse({ page: "0" })).toThrow();
  });
});

// ─── CHAT SCHEMAS ──────────────────────────────────────

describe("startConversationSchema", () => {
  it("accepts valid UUID", () => {
    const result = startConversationSchema.parse({ characterId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" });
    expect(result.characterId).toBeDefined();
  });

  it("rejects invalid UUID format", () => {
    expect(() => startConversationSchema.parse({ characterId: "not-a-uuid" })).toThrow();
  });
});

describe("sendMessageSchema", () => {
  it("accepts text message with defaults", () => {
    const result = sendMessageSchema.parse({ content: "Hello!" });
    expect(result.content).toBe("Hello!");
    expect(result.type).toBe("text");
  });

  it("accepts voice type", () => {
    const result = sendMessageSchema.parse({ content: "Hi", type: "voice" });
    expect(result.type).toBe("voice");
  });

  it("rejects empty content", () => {
    expect(() => sendMessageSchema.parse({ content: "" })).toThrow();
  });

  it("rejects content over 4000 chars", () => {
    expect(() => sendMessageSchema.parse({ content: "a".repeat(4001) })).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() => sendMessageSchema.parse({ content: "Hi", type: "video" })).toThrow();
  });
});

describe("listMessagesSchema", () => {
  it("provides default limit of 50", () => {
    const result = listMessagesSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it("accepts cursor parameter", () => {
    const result = listMessagesSchema.parse({ cursor: "42" });
    expect(result.cursor).toBe("42");
  });
});

// ─── SUBSCRIPTION SCHEMAS ──────────────────────────────

describe("createSubscriptionSchema", () => {
  it("accepts buddy plan", () => {
    expect(createSubscriptionSchema.parse({ plan: "buddy" }).plan).toBe("buddy");
  });

  it("accepts bff plan", () => {
    expect(createSubscriptionSchema.parse({ plan: "bff" }).plan).toBe("bff");
  });

  it("rejects free plan (cannot subscribe to free)", () => {
    expect(() => createSubscriptionSchema.parse({ plan: "free" })).toThrow();
  });

  it("rejects unknown plan", () => {
    expect(() => createSubscriptionSchema.parse({ plan: "enterprise" })).toThrow();
  });
});

// ─── COMMON SCHEMAS ───────────────────────────────────

describe("uuidParamSchema", () => {
  it("accepts valid v4 UUID", () => {
    const result = uuidParamSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.id).toBeDefined();
  });

  it("rejects non-UUID strings", () => {
    expect(() => uuidParamSchema.parse({ id: "123" })).toThrow();
    expect(() => uuidParamSchema.parse({ id: "" })).toThrow();
  });
});
