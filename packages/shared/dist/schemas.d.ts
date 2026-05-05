import { z } from "zod";
export declare const sendOtpSchema: z.ZodObject<{
    phone: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
}, {
    phone: string;
}>;
export declare const verifyOtpSchema: z.ZodObject<{
    phone: z.ZodString;
    otp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    phone: string;
    otp: string;
}, {
    phone: string;
    otp: string;
}>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const onboardingSchema: z.ZodObject<{
    name: z.ZodString;
    language: z.ZodEnum<["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    language: "hi" | "en" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu" | "pa" | "or" | "as" | "hinglish";
}, {
    name: string;
    language: "hi" | "en" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu" | "pa" | "or" | "as" | "hinglish";
}>;
export declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    language: z.ZodOptional<z.ZodEnum<["hi", "en", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa", "or", "as", "hinglish"]>>;
    avatarUrl: z.ZodOptional<z.ZodString>;
    contentFilter: z.ZodOptional<z.ZodEnum<["safe", "adult"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    language?: "hi" | "en" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu" | "pa" | "or" | "as" | "hinglish" | undefined;
    avatarUrl?: string | undefined;
    contentFilter?: "safe" | "adult" | undefined;
}, {
    name?: string | undefined;
    language?: "hi" | "en" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu" | "pa" | "or" | "as" | "hinglish" | undefined;
    avatarUrl?: string | undefined;
    contentFilter?: "safe" | "adult" | undefined;
}>;
export declare const listCharactersSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    category?: string | undefined;
    search?: string | undefined;
}, {
    category?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const createCharacterSchema: z.ZodObject<{
    name: z.ZodString;
    avatarUrl: z.ZodString;
    category: z.ZodString;
    personality: z.ZodObject<{
        traits: z.ZodArray<z.ZodString, "many">;
        tone: z.ZodString;
        quirks: z.ZodArray<z.ZodString, "many">;
        speakingStyle: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        traits: string[];
        tone: string;
        quirks: string[];
        speakingStyle: string;
    }, {
        traits: string[];
        tone: string;
        quirks: string[];
        speakingStyle: string;
    }>;
    backstory: z.ZodString;
    scenarioIntro: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    avatarUrl: string;
    category: string;
    personality: {
        traits: string[];
        tone: string;
        quirks: string[];
        speakingStyle: string;
    };
    backstory: string;
    scenarioIntro: string;
}, {
    name: string;
    avatarUrl: string;
    category: string;
    personality: {
        traits: string[];
        tone: string;
        quirks: string[];
        speakingStyle: string;
    };
    backstory: string;
    scenarioIntro: string;
}>;
export declare const startConversationSchema: z.ZodObject<{
    characterId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    characterId: string;
}, {
    characterId: string;
}>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["text", "voice"]>>;
}, "strip", z.ZodTypeAny, {
    type: "text" | "voice";
    content: string;
}, {
    content: string;
    type?: "text" | "voice" | undefined;
}>;
export declare const generateImageSchema: z.ZodObject<{
    prompt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    prompt: string;
}, {
    prompt: string;
}>;
export declare const listMessagesSchema: z.ZodObject<{
    cursor: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    cursor?: string | undefined;
}, {
    limit?: number | undefined;
    cursor?: string | undefined;
}>;
export declare const reportConversationSchema: z.ZodObject<{
    reason: z.ZodEnum<["inappropriate", "offensive", "spam", "bug", "other"]>;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason: "inappropriate" | "offensive" | "spam" | "bug" | "other";
    details?: string | undefined;
}, {
    reason: "inappropriate" | "offensive" | "spam" | "bug" | "other";
    details?: string | undefined;
}>;
export declare const createSubscriptionSchema: z.ZodObject<{
    plan: z.ZodEnum<["pro"]>;
    useTrial: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    plan: "pro";
    useTrial: boolean;
}, {
    plan: "pro";
    useTrial?: boolean | undefined;
}>;
export declare const uuidParamSchema: z.ZodObject<{
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
}, {
    id: string;
}>;
//# sourceMappingURL=schemas.d.ts.map