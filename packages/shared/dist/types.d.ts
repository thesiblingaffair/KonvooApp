export interface User {
    id: string;
    phone: string;
    name: string | null;
    language: SupportedLanguage;
    avatarUrl: string | null;
    createdAt: string;
}
export type SupportedLanguage = "hi" | "en" | "ta" | "te" | "bn" | "mr" | "kn" | "ml" | "gu" | "pa" | "or" | "as" | "hinglish";
export declare const SUPPORTED_LANGUAGES: Array<{
    code: SupportedLanguage;
    label: string;
    native: string;
}>;
export interface CharacterPersonality {
    traits: string[];
    tone: string;
    quirks: string[];
    speakingStyle: string;
}
export interface Character {
    id: string;
    name: string;
    avatarUrl: string;
    category: string;
    personality: CharacterPersonality;
    backstory: string;
    scenarioIntro?: string;
    isPremium: boolean;
    isFavorite?: boolean;
}
export interface CharacterDetail extends Character {
    scenarioIntro: string;
    conversationId: string | null;
}
export interface Conversation {
    id: string;
    characterId: string;
    characterName: string;
    characterAvatar: string;
    characterCategory: string;
    lastMessage: string | null;
    lastAt: string | null;
    messageCount: number;
    isArchived: boolean;
}
export interface ConversationMemory {
    summary: string;
    keyFacts: string[];
    emotionalState: string;
    lastUpdated: string;
}
export type MessageRole = "user" | "assistant" | "system";
export type ContentType = "text" | "image" | "voice";
export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    contentType: ContentType;
    imageUrl?: string;
    voiceUrl?: string;
    createdAt: string;
    metadata?: MessageMetadata;
}
export interface MessageMetadata {
    languageDetected?: string;
    tokensUsed?: number;
    model?: string;
    generationTimeMs?: number;
    moderationFlag?: string;
}
export type PlanType = "free" | "pro";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "halted" | "pending" | "trial";
export interface Subscription {
    plan: PlanType;
    status: SubscriptionStatus;
    expiresAt: string | null;
    isTrial?: boolean;
    trialEndsAt?: string | null;
}
export interface SubscriptionDetail extends Subscription {
    limits: PlanLimits;
    usage: PlanUsage;
}
export interface PlanLimits {
    messageLimit: number;
    monthlyImages: number;
    voiceEnabled: boolean;
    customCharacters: boolean;
    priorityQueue: boolean;
}
export interface PlanUsage {
    messagesSent: number;
    monthlyImages: number;
}
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet";
export type PaymentStatus = "captured" | "failed" | "refunded";
export interface Payment {
    id: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    method?: PaymentMethod;
    createdAt: string;
}
export interface MemoryItem {
    id: string;
    fact: string;
    createdAt: string;
}
export interface MemoryResponse {
    summary: string;
    memories: MemoryItem[];
    emotionalState: string;
    totalCount: number;
}
export interface SuggestionsResponse {
    suggestions: string[];
    conversationId: string;
}
export type ReportReason = "inappropriate" | "offensive" | "spam" | "bug" | "other";
export interface ReportRequest {
    reason: ReportReason;
    details?: string;
}
export interface WsClientEvents {
    join_conversation: {
        conversationId: string;
    };
    message: {
        conversationId: string;
        content: string;
        type?: ContentType;
    };
    generate_image: {
        conversationId: string;
        prompt: string;
    };
    typing: {
        conversationId: string;
    };
}
export interface WsServerEvents {
    joined: {
        conversationId: string;
    };
    token: {
        conversationId: string;
        content: string;
    };
    typing_start: {
        conversationId: string;
    };
    typing_end: {
        conversationId: string;
    };
    message_saved: Message;
    message_complete: Message & {
        metadata: MessageMetadata;
    };
    image_generating: {
        conversationId: string;
        jobId: string;
        prompt: string;
    };
    image_complete: {
        conversationId: string;
        url: string;
        jobId: string;
    };
    limit_reached: {
        type: "messages" | "images";
        plan: PlanType;
        used: number;
        limit: number;
    };
    moderation: {
        flag: string;
        message: string;
    };
    error: {
        code: string;
        message: string;
    };
}
export interface ApiPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface AuthResponse {
    success: boolean;
    accessToken: string;
    refreshToken: string;
    user: User;
    isNewUser: boolean;
}
export interface OtpResponse {
    success: boolean;
    message: string;
    expiresIn: number;
}
export interface CharacterListResponse {
    characters: Character[];
    pagination: ApiPagination;
}
export interface MessagesResponse {
    messages: Message[];
    hasMore: boolean;
    cursor: string | null;
}
export interface SendMessageResponse {
    message: Message;
    imageGeneration?: {
        status: "queued" | "limit_reached";
        prompt?: string;
        jobId?: string;
        used?: number;
        limit?: number;
    };
}
export interface CreateSubscriptionResponse {
    subscriptionId: string;
    shortUrl: string;
    plan: PlanType;
    amount: number;
    currency: string;
    isTrial: boolean;
    trialEndsAt?: string;
    razorpayConfig: {
        key: string;
        subscription_id: string;
        name: string;
        description: string;
        prefill: {
            contact: string;
        };
        theme: {
            color: string;
        };
    };
}
export interface UserProfile {
    user: User;
    subscription: Subscription;
    usage: {
        messages: {
            used: number;
            limit: number;
        };
        monthlyImages: {
            used: number;
            limit: number;
        };
    };
    stats: {
        conversations: number;
        favorites: number;
    };
}
export interface ApiError {
    error: string;
    code: string;
    details?: Array<{
        field: string;
        message: string;
    }>;
    statusCode: number;
}
export declare const API_ERROR_CODES: {
    readonly AUTH_REQUIRED: "AUTH_REQUIRED";
    readonly TOKEN_EXPIRED: "TOKEN_EXPIRED";
    readonly TOKEN_INVALID: "TOKEN_INVALID";
    readonly OTP_RATE_LIMITED: "OTP_RATE_LIMITED";
    readonly OTP_INVALID: "OTP_INVALID";
    readonly OTP_SEND_FAILED: "OTP_SEND_FAILED";
    readonly MESSAGE_LIMIT_REACHED: "MESSAGE_LIMIT_REACHED";
    readonly PREMIUM_REQUIRED: "PREMIUM_REQUIRED";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly ALREADY_SUBSCRIBED: "ALREADY_SUBSCRIBED";
    readonly PAYMENT_ERROR: "PAYMENT_ERROR";
    readonly TRIAL_ALREADY_USED: "TRIAL_ALREADY_USED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
//# sourceMappingURL=types.d.ts.map