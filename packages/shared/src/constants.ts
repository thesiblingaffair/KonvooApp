import type { PlanType, PlanLimits } from "./types";

// ─── PLAN LIMITS ───────────────────────────────────────

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    messageLimit: 6,       // 6 lifetime messages (not daily)
    monthlyImages: 0,       // No images on free plan
    voiceEnabled: false,
    customCharacters: false,
    priorityQueue: false,
  },
  pro: {
    messageLimit: Infinity,
    monthlyImages: 5,      // 5 per billing cycle (monthly)
    voiceEnabled: true,
    customCharacters: true,
    priorityQueue: true,
  },
};

// Trial-specific image limit (flat, not per month)
export const TRIAL_IMAGE_LIMIT = 1;

// ─── PLAN PRICING ──────────────────────────────────────

export const PLAN_PRICING: Record<PlanType, { amount: number; currency: string; label: string }> = {
  free: { amount: 0, currency: "INR", label: "\u20B90" },
  pro: { amount: 9900, currency: "INR", label: "\u20B999/mo" },
};

// ─── TRIAL CONFIG ──────────────────────────────────────

export const TRIAL_CONFIG = {
  amount: 9900, // ₹99 in paise (no trial — same as full price)
  durationDays: 30,
  currency: "INR",
  label: "₹99/month",
} as const;

// ─── CHARACTER CATEGORIES ──────────────────────────────

export const CHARACTER_CATEGORIES = [
  "college", "chai", "travel", "office", "gym",
  "festival", "startup", "nightowl", "cricket",
  "food", "arts", "wellness", "music", "pets",
  "lifestyle", "roommate", "cafe",
] as const;

export type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number];

// ─── APP CONSTANTS ─────────────────────────────────────

export const APP_NAME = "Konvoo";
export const APP_THEME_COLOR = "#E8652B";
export const APP_SUPPORT_EMAIL = "support@konvoo.live";

export const MESSAGE_MAX_LENGTH = 4000;
export const IMAGE_PROMPT_MAX_LENGTH = 500;
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300;
export const MAX_OTP_ATTEMPTS = 3;
export const OTP_RATE_LIMIT_WINDOW = 600; // 10 minutes

export const CONTEXT_WINDOW_MESSAGES = 20;
export const MEMORY_UPDATE_INTERVAL = 10; // every N messages
export const MAX_RESPONSE_TOKENS = 800;
export const SUGGESTION_COUNT = 4;

// ─── MODERATION ────────────────────────────────────────

export const MODERATION_FLAGS = [
  "sexual",
  "violence",
  "self_harm",
  "boundary_violation",
  "spam",
] as const;

export type ModerationFlag = (typeof MODERATION_FLAGS)[number];

// ─── HELPERS ───────────────────────────────────────────

export function getPlanLimits(plan: PlanType): PlanLimits {
  return PLAN_LIMITS[plan];
}

export function canSendMessage(plan: PlanType, totalUsed: number): boolean {
  const limits = PLAN_LIMITS[plan];
  return limits.messageLimit === Infinity || totalUsed < limits.messageLimit;
}

export function canGenerateImage(plan: PlanType, monthlyUsed: number): boolean {
  return monthlyUsed < PLAN_LIMITS[plan].monthlyImages;
}

export function isFeatureAvailable(plan: PlanType, feature: "voice" | "customCharacters" | "priorityQueue"): boolean {
  return PLAN_LIMITS[plan][feature as keyof PlanLimits] as boolean;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}
