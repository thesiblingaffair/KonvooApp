"use strict";
// ─── USERS ─────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_ERROR_CODES = exports.SUPPORTED_LANGUAGES = void 0;
exports.SUPPORTED_LANGUAGES = [
    { code: "hinglish", label: "Hinglish", native: "Hinglish" },
    { code: "hi", label: "Hindi", native: "हिन्दी" },
    { code: "en", label: "English", native: "English" },
    { code: "ta", label: "Tamil", native: "தமிழ்" },
    { code: "te", label: "Telugu", native: "తెలుగు" },
    { code: "bn", label: "Bengali", native: "বাংলা" },
    { code: "mr", label: "Marathi", native: "मराठी" },
    { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
    { code: "ml", label: "Malayalam", native: "മലയാളം" },
    { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
    { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
    { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
    { code: "as", label: "Assamese", native: "অসমীয়া" },
];
exports.API_ERROR_CODES = {
    AUTH_REQUIRED: "AUTH_REQUIRED",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    TOKEN_INVALID: "TOKEN_INVALID",
    OTP_RATE_LIMITED: "OTP_RATE_LIMITED",
    OTP_INVALID: "OTP_INVALID",
    OTP_SEND_FAILED: "OTP_SEND_FAILED",
    MESSAGE_LIMIT_REACHED: "MESSAGE_LIMIT_REACHED",
    PREMIUM_REQUIRED: "PREMIUM_REQUIRED",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    NOT_FOUND: "NOT_FOUND",
    RATE_LIMITED: "RATE_LIMITED",
    ALREADY_SUBSCRIBED: "ALREADY_SUBSCRIBED",
    PAYMENT_ERROR: "PAYMENT_ERROR",
    TRIAL_ALREADY_USED: "TRIAL_ALREADY_USED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
};
//# sourceMappingURL=types.js.map