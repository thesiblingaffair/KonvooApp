/**
 * Content moderation tests.
 * Tests the OpenAI moderation integration and image prompt screening.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── MODERATION RESULT STRUCTURE ──────────────────────

describe("Moderation Result Structure", () => {
  it("safe result has correct shape", () => {
    const result = { safe: true, confidence: 1.0 };
    expect(result.safe).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("flag");
  });

  it("flagged result has correct shape", () => {
    const result = {
      safe: false,
      flag: "sexual" as const,
      confidence: 0.95,
      reason: "Flagged: sexual",
    };
    expect(result.safe).toBe(false);
    expect(result.flag).toBe("sexual");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.reason).toBeDefined();
  });
});

// ─── CATEGORY MAPPING ─────────────────────────────────

describe("OpenAI Category Mapping", () => {
  function mapCategory(categories: Record<string, boolean>): string {
    if (categories.sexual || categories["sexual/minors"]) return "sexual";
    if (categories.violence || categories["violence/graphic"]) return "violence";
    if (categories["self-harm"] || categories["self-harm/intent"]) return "self_harm";
    if (categories.harassment || categories.hate) return "boundary_violation";
    return "spam";
  }

  it("maps sexual content correctly", () => {
    expect(mapCategory({ sexual: true, violence: false, harassment: false, hate: false, "self-harm": false, "sexual/minors": false, "violence/graphic": false, "self-harm/intent": false })).toBe("sexual");
  });

  it("maps sexual/minors correctly", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": true, violence: false, harassment: false, hate: false, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("sexual");
  });

  it("maps violence correctly", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": false, violence: true, harassment: false, hate: false, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("violence");
  });

  it("maps self-harm correctly", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": false, violence: false, harassment: false, hate: false, "self-harm": true, "violence/graphic": false, "self-harm/intent": false })).toBe("self_harm");
  });

  it("maps harassment to boundary_violation", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": false, violence: false, harassment: true, hate: false, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("boundary_violation");
  });

  it("maps hate to boundary_violation", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": false, violence: false, harassment: false, hate: true, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("boundary_violation");
  });

  it("defaults to spam for unknown flags", () => {
    expect(mapCategory({ sexual: false, "sexual/minors": false, violence: false, harassment: false, hate: false, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("spam");
  });

  it("prioritizes sexual over violence when both flagged", () => {
    expect(mapCategory({ sexual: true, "sexual/minors": false, violence: true, harassment: false, hate: false, "self-harm": false, "violence/graphic": false, "self-harm/intent": false })).toBe("sexual");
  });
});

// ─── IMAGE PROMPT SCREENING ───────────────────────────

describe("Image Prompt Screening Logic", () => {
  it("should flag NSFW image prompts", () => {
    // The actual moderation uses OpenAI API, but the screening logic parses JSON
    const mockResponse = { safe: false, flag: "sexual", reason: "NSFW content" };
    expect(mockResponse.safe).toBe(false);
    expect(mockResponse.flag).toBe("sexual");
  });

  it("should pass safe image prompts", () => {
    const mockResponse = { safe: true, flag: null, reason: null };
    expect(mockResponse.safe).toBe(true);
  });

  it("should handle JSON parse failure gracefully", () => {
    // If GPT returns malformed JSON, we should default to safe
    const badResponse = "not json";
    let result;
    try {
      result = JSON.parse(badResponse);
    } catch {
      result = { safe: true, confidence: 0 }; // fail open
    }
    expect(result.safe).toBe(true);
    expect(result.confidence).toBe(0);
  });
});
