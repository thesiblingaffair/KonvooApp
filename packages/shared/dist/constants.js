"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODERATION_FLAGS = exports.SUGGESTION_COUNT = exports.MAX_RESPONSE_TOKENS = exports.MEMORY_UPDATE_INTERVAL = exports.CONTEXT_WINDOW_MESSAGES = exports.OTP_RATE_LIMIT_WINDOW = exports.MAX_OTP_ATTEMPTS = exports.OTP_EXPIRY_SECONDS = exports.OTP_LENGTH = exports.IMAGE_PROMPT_MAX_LENGTH = exports.MESSAGE_MAX_LENGTH = exports.APP_SUPPORT_EMAIL = exports.APP_THEME_COLOR = exports.APP_NAME = exports.CHARACTER_CATEGORIES = exports.TRIAL_CONFIG = exports.PLAN_PRICING = exports.TRIAL_IMAGE_LIMIT = exports.PLAN_LIMITS = void 0;
exports.getPlanLimits = getPlanLimits;
exports.canSendMessage = canSendMessage;
exports.canGenerateImage = canGenerateImage;
exports.isFeatureAvailable = isFeatureAvailable;
exports.formatPhone = formatPhone;
// ─── PLAN LIMITS ───────────────────────────────────────
exports.PLAN_LIMITS = {
    free: {
        messageLimit: 6, // 6 lifetime messages (not daily)
        monthlyImages: 0, // No images on free plan
        voiceEnabled: false,
        customCharacters: false,
        priorityQueue: false,
    },
    pro: {
        messageLimit: Infinity,
        monthlyImages: 5, // 5 per billing cycle (monthly)
        voiceEnabled: true,
        customCharacters: true,
        priorityQueue: true,
    },
};
// Trial-specific image limit (flat, not per month)
exports.TRIAL_IMAGE_LIMIT = 1;
// ─── PLAN PRICING ──────────────────────────────────────
exports.PLAN_PRICING = {
    free: { amount: 0, currency: "INR", label: "\u20B90" },
    pro: { amount: 9900, currency: "INR", label: "\u20B999/mo" },
};
// ─── TRIAL CONFIG ──────────────────────────────────────
exports.TRIAL_CONFIG = {
    amount: 9900, // ₹99 in paise (no trial — same as full price)
    durationDays: 30,
    currency: "INR",
    label: "₹99/month",
};
// ─── CHARACTER CATEGORIES ──────────────────────────────
exports.CHARACTER_CATEGORIES = [
    "college", "chai", "travel", "office", "gym",
    "festival", "startup", "nightowl", "cricket",
    "food", "arts", "wellness", "music", "pets",
    "lifestyle", "roommate", "cafe",
];
// ─── APP CONSTANTS ─────────────────────────────────────
exports.APP_NAME = "Konvoo";
exports.APP_THEME_COLOR = "#E8652B";
exports.APP_SUPPORT_EMAIL = "support@konvoo.live";
exports.MESSAGE_MAX_LENGTH = 4000;
exports.IMAGE_PROMPT_MAX_LENGTH = 500;
exports.OTP_LENGTH = 6;
exports.OTP_EXPIRY_SECONDS = 300;
exports.MAX_OTP_ATTEMPTS = 3;
exports.OTP_RATE_LIMIT_WINDOW = 600; // 10 minutes
exports.CONTEXT_WINDOW_MESSAGES = 20;
exports.MEMORY_UPDATE_INTERVAL = 10; // every N messages
exports.MAX_RESPONSE_TOKENS = 800;
exports.SUGGESTION_COUNT = 4;
// ─── MODERATION ────────────────────────────────────────
exports.MODERATION_FLAGS = [
    "sexual",
    "violence",
    "self_harm",
    "boundary_violation",
    "spam",
];
// ─── HELPERS ───────────────────────────────────────────
function getPlanLimits(plan) {
    return exports.PLAN_LIMITS[plan];
}
function canSendMessage(plan, totalUsed) {
    const limits = exports.PLAN_LIMITS[plan];
    return limits.messageLimit === Infinity || totalUsed < limits.messageLimit;
}
function canGenerateImage(plan, monthlyUsed) {
    return monthlyUsed < exports.PLAN_LIMITS[plan].monthlyImages;
}
function isFeatureAvailable(plan, feature) {
    return exports.PLAN_LIMITS[plan][feature];
}
function formatPhone(phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) {
        return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    return phone;
}
//# sourceMappingURL=constants.js.map