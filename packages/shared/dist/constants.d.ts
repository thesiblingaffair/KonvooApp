import type { PlanType, PlanLimits } from "./types";
export declare const PLAN_LIMITS: Record<PlanType, PlanLimits>;
export declare const TRIAL_IMAGE_LIMIT = 1;
export declare const PLAN_PRICING: Record<PlanType, {
    amount: number;
    currency: string;
    label: string;
}>;
export declare const TRIAL_CONFIG: {
    readonly amount: 9900;
    readonly durationDays: 30;
    readonly currency: "INR";
    readonly label: "₹99/month";
};
export declare const CHARACTER_CATEGORIES: readonly ["college", "chai", "travel", "office", "gym", "festival", "startup", "nightowl", "cricket", "food", "arts", "wellness", "music", "pets", "lifestyle", "roommate", "cafe"];
export type CharacterCategory = (typeof CHARACTER_CATEGORIES)[number];
export declare const APP_NAME = "Konvoo";
export declare const APP_THEME_COLOR = "#E8652B";
export declare const APP_SUPPORT_EMAIL = "support@konvoo.live";
export declare const MESSAGE_MAX_LENGTH = 4000;
export declare const IMAGE_PROMPT_MAX_LENGTH = 500;
export declare const OTP_LENGTH = 6;
export declare const OTP_EXPIRY_SECONDS = 300;
export declare const MAX_OTP_ATTEMPTS = 3;
export declare const OTP_RATE_LIMIT_WINDOW = 600;
export declare const CONTEXT_WINDOW_MESSAGES = 20;
export declare const MEMORY_UPDATE_INTERVAL = 10;
export declare const MAX_RESPONSE_TOKENS = 800;
export declare const SUGGESTION_COUNT = 4;
export declare const MODERATION_FLAGS: readonly ["sexual", "violence", "self_harm", "boundary_violation", "spam"];
export type ModerationFlag = (typeof MODERATION_FLAGS)[number];
export declare function getPlanLimits(plan: PlanType): PlanLimits;
export declare function canSendMessage(plan: PlanType, totalUsed: number): boolean;
export declare function canGenerateImage(plan: PlanType, monthlyUsed: number): boolean;
export declare function isFeatureAvailable(plan: PlanType, feature: "voice" | "customCharacters" | "priorityQueue"): boolean;
export declare function formatPhone(phone: string): string;
//# sourceMappingURL=constants.d.ts.map