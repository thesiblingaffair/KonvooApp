"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uuidParamSchema = exports.createSubscriptionSchema = exports.reportConversationSchema = exports.listMessagesSchema = exports.generateImageSchema = exports.sendMessageSchema = exports.startConversationSchema = exports.createCharacterSchema = exports.listCharactersSchema = exports.updateProfileSchema = exports.onboardingSchema = exports.refreshTokenSchema = exports.verifyOtpSchema = exports.sendOtpSchema = void 0;
const zod_1 = require("zod");
// ─── AUTH ──────────────────────────────────────────────
exports.sendOtpSchema = zod_1.z.object({
    phone: zod_1.z.string().regex(/^\+91[6-9]\d{9}$/, "Invalid Indian phone number. Format: +91XXXXXXXXXX"),
});
exports.verifyOtpSchema = zod_1.z.object({
    phone: zod_1.z.string().regex(/^\+91[6-9]\d{9}$/),
    otp: zod_1.z.string().length(6, "OTP must be 6 digits"),
});
exports.refreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.onboardingSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    language: zod_1.z.enum(["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]),
});
// ─── USER ──────────────────────────────────────────────
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    language: zod_1.z.enum(["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]).optional(),
    avatarUrl: zod_1.z.string().url().optional(),
    contentFilter: zod_1.z.enum(["safe", "adult"]).optional(),
});
// ─── CHARACTERS ────────────────────────────────────────
exports.listCharactersSchema = zod_1.z.object({
    category: zod_1.z.string().optional(),
    search: zod_1.z.string().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
exports.createCharacterSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    avatarUrl: zod_1.z.string().url(),
    category: zod_1.z.string().min(1).max(50),
    personality: zod_1.z.object({
        traits: zod_1.z.array(zod_1.z.string()).min(1).max(10),
        tone: zod_1.z.string(),
        quirks: zod_1.z.array(zod_1.z.string()),
        speakingStyle: zod_1.z.string(),
    }),
    backstory: zod_1.z.string().min(10).max(5000),
    scenarioIntro: zod_1.z.string().min(10).max(2000),
});
// ─── CHAT ──────────────────────────────────────────────
exports.startConversationSchema = zod_1.z.object({
    characterId: zod_1.z.string().uuid(),
});
exports.sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1).max(4000),
    type: zod_1.z.enum(["text", "voice"]).default("text"),
});
exports.generateImageSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1).max(500),
});
exports.listMessagesSchema = zod_1.z.object({
    cursor: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(50),
});
// ─── REPORT ────────────────────────────────────────────
exports.reportConversationSchema = zod_1.z.object({
    reason: zod_1.z.enum(["inappropriate", "offensive", "spam", "bug", "other"]),
    details: zod_1.z.string().max(1000).optional(),
});
// ─── SUBSCRIPTIONS ─────────────────────────────────────
exports.createSubscriptionSchema = zod_1.z.object({
    plan: zod_1.z.enum(["pro"]),
    useTrial: zod_1.z.boolean().default(false),
});
// ─── COMMON ────────────────────────────────────────────
exports.uuidParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
//# sourceMappingURL=schemas.js.map