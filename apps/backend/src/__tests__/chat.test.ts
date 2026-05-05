/**
 * Chat logic tests.
 * Tests: system prompt building, message history assembly, image request extraction.
 */
import { describe, it, expect } from "vitest";

// ─── SYSTEM PROMPT BUILDER ────────────────────────────

// Extracted from chat/routes.ts for testability
function buildSystemPrompt(character: any, user: any, memory?: any): string {
  const p = character.personality || {};
  return `You are ${character.name}. ${character.backstory}

PERSONALITY: ${(p.traits || []).join(", ")}
TONE: ${p.tone || "friendly"}
QUIRKS: ${(p.quirks || []).join(", ")}
STYLE: ${p.speakingStyle || "casual"}
SCENARIO: ${character.scenarioIntro}

RULES:
1. LANGUAGE: Detect user's language, respond in same. Preferred: ${user.language || "hi"}. Mirror code-switching.
2. FORMAT: *actions in asterisks* "Speech in quotes". Keep actions brief.
3. CHARACTER: Stay in character. Never mention being AI. Reference Indian culture naturally.
4. MEMORY: ${memory?.summary || "New conversation. Introduce yourself and set the scene."}
   ${memory?.keyFacts?.length ? `Key facts: ${memory.keyFacts.join("; ")}` : ""}
5. BOUNDARIES: Friendship only. Platonic. Redirect boundary violations gently.
6. IMAGES: If user asks for picture, include [IMAGE_REQUEST: description].
7. LENGTH: 2-4 paragraphs max.`;
}

describe("buildSystemPrompt", () => {
  const character = {
    name: "Aarav",
    backstory: "A 22-year-old engineering student at IIT Delhi.",
    personality: {
      traits: ["enthusiastic", "loyal", "dramatic"],
      tone: "casual, peppy",
      quirks: ["says yaar constantly", "references Bollywood"],
      speakingStyle: "Hinglish, high energy",
    },
    scenarioIntro: "You're in the hostel room at night.",
  };

  const user = { language: "hi" };

  it("includes character name and backstory", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("You are Aarav");
    expect(prompt).toContain("IIT Delhi");
  });

  it("includes personality traits", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("enthusiastic");
    expect(prompt).toContain("loyal");
    expect(prompt).toContain("dramatic");
  });

  it("includes tone and speaking style", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("casual, peppy");
    expect(prompt).toContain("Hinglish, high energy");
  });

  it("includes quirks", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("says yaar constantly");
    expect(prompt).toContain("references Bollywood");
  });

  it("includes scenario intro", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("hostel room at night");
  });

  it("uses user language preference", () => {
    const prompt = buildSystemPrompt(character, { language: "ta" });
    expect(prompt).toContain("Preferred: ta");
  });

  it("defaults to Hindi when no language set", () => {
    const prompt = buildSystemPrompt(character, {});
    expect(prompt).toContain("Preferred: hi");
  });

  it("includes memory summary when provided", () => {
    const memory = {
      summary: "User is stressed about exams. Talked about cricket yesterday.",
      keyFacts: ["user name is Rahul", "studies CS"],
    };
    const prompt = buildSystemPrompt(character, user, memory);
    expect(prompt).toContain("stressed about exams");
    expect(prompt).toContain("user name is Rahul");
    expect(prompt).toContain("studies CS");
  });

  it("uses default memory text for new conversations", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("New conversation. Introduce yourself and set the scene.");
  });

  it("handles missing personality gracefully", () => {
    const minimalChar = { name: "Test", backstory: "A test character.", scenarioIntro: "Test scenario." };
    const prompt = buildSystemPrompt(minimalChar, user);
    expect(prompt).toContain("You are Test");
    expect(prompt).toContain("TONE: friendly"); // default
    expect(prompt).toContain("STYLE: casual");  // default
  });

  it("includes boundary rules", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("Friendship only");
    expect(prompt).toContain("Platonic");
  });

  it("includes image request instruction", () => {
    const prompt = buildSystemPrompt(character, user);
    expect(prompt).toContain("[IMAGE_REQUEST:");
  });
});

// ─── IMAGE REQUEST EXTRACTION ─────────────────────────

describe("Image Request Extraction", () => {
  const imageRegex = /\[IMAGE_REQUEST:\s*(.+?)\]/;

  it("extracts image prompt from response", () => {
    const response = '*laughs* "Sure yaar, let me imagine that!" [IMAGE_REQUEST: a sunset over the Ganges in Varanasi] "Beautiful, no?"';
    const match = response.match(imageRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("a sunset over the Ganges in Varanasi");
  });

  it("strips image tag from response text", () => {
    const response = 'Hello [IMAGE_REQUEST: chai stall in Mumbai] Goodbye';
    const cleaned = response.replace(/\[IMAGE_REQUEST:\s*.+?\]/, "").trim();
    expect(cleaned).toBe("Hello  Goodbye");
    expect(cleaned).not.toContain("IMAGE_REQUEST");
  });

  it("returns null when no image request present", () => {
    const response = "*waves* Hello yaar, kya haal hai?";
    const match = response.match(imageRegex);
    expect(match).toBeNull();
  });

  it("handles multiple image requests (takes first)", () => {
    const response = "[IMAGE_REQUEST: first] text [IMAGE_REQUEST: second]";
    const match = response.match(imageRegex);
    expect(match![1]).toBe("first");
  });
});

// ─── MESSAGE HISTORY ASSEMBLY ─────────────────────────

describe("Message History Assembly", () => {
  it("puts system prompt first", () => {
    const systemPrompt = "You are Aarav...";
    const recentMsgs = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hey yaar!" },
    ];

    const history = [
      { role: "system" as const, content: systemPrompt },
      ...recentMsgs.filter(m => m.role !== "system").map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    expect(history[0].role).toBe("system");
    expect(history[1].role).toBe("user");
    expect(history[2].role).toBe("assistant");
  });

  it("filters out system messages from history", () => {
    const msgs = [
      { role: "system", content: "initial" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];

    const filtered = msgs.filter(m => m.role !== "system");
    expect(filtered).toHaveLength(2);
    expect(filtered.every(m => m.role !== "system")).toBe(true);
  });

  it("limits context window to 20 messages", () => {
    const CONTEXT_WINDOW = 20;
    const msgs = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
    }));

    const limited = msgs.slice(-CONTEXT_WINDOW);
    expect(limited).toHaveLength(20);
    expect(limited[0].content).toBe("Message 30"); // starts from the 31st
  });
});
