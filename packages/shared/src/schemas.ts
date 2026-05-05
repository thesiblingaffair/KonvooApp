import { z } from "zod";
import type { SupportedLanguage } from "./types";

// ─── AUTH ──────────────────────────────────────────────

export const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, "Invalid Indian phone number. Format: +91XXXXXXXXXX"),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const onboardingSchema = z.object({
  name: z.string().min(1).max(100),
  language: z.enum(["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]),
});

// ─── USER ──────────────────────────────────────────────

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  language: z.enum(["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]).optional(),
  avatarUrl: z.string().url().optional(),
  contentFilter: z.enum(["safe", "adult"]).optional(),
});

// ─── CHARACTERS ────────────────────────────────────────

export const listCharactersSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url(),
  category: z.string().min(1).max(50),
  personality: z.object({
    traits: z.array(z.string()).min(1).max(10),
    tone: z.string(),
    quirks: z.array(z.string()),
    speakingStyle: z.string(),
  }),
  backstory: z.string().min(10).max(5000),
  scenarioIntro: z.string().min(10).max(2000),
});

// ─── CHAT ──────────────────────────────────────────────

export const startConversationSchema = z.object({
  characterId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  type: z.enum(["text", "voice"]).default("text"),
});

export const generateImageSchema = z.object({
  prompt: z.string().min(1).max(500),
});

export const listMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── REPORT ────────────────────────────────────────────

export const reportConversationSchema = z.object({
  reason: z.enum(["inappropriate", "offensive", "spam", "bug", "other"]),
  details: z.string().max(1000).optional(),
});

// ─── SUBSCRIPTIONS ─────────────────────────────────────

export const createSubscriptionSchema = z.object({
  plan: z.enum(["pro"]),
  useTrial: z.boolean().default(false),
});

// ─── COMMON ────────────────────────────────────────────

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
