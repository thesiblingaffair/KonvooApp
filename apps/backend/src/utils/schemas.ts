/**
 * Re-exports from @yaari/shared
 * 
 * All schemas, types, and constants are defined in packages/shared
 * and re-exported here so backend module imports don't need to change.
 */
export {
  // Schemas
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  onboardingSchema,
  updateProfileSchema,
  listCharactersSchema,
  createCharacterSchema,
  startConversationSchema,
  sendMessageSchema,
  generateImageSchema,
  listMessagesSchema,
  createSubscriptionSchema,
  reportConversationSchema,
  uuidParamSchema,

  // Constants
  PLAN_LIMITS,
  PLAN_PRICING,
  TRIAL_CONFIG,
  TRIAL_IMAGE_LIMIT,
  SUGGESTION_COUNT,
  canSendMessage,
  canGenerateImage,
  isFeatureAvailable,
  CONTEXT_WINDOW_MESSAGES,
  MEMORY_UPDATE_INTERVAL,
  MAX_RESPONSE_TOKENS,
  OTP_LENGTH,
  OTP_EXPIRY_SECONDS,
  MAX_OTP_ATTEMPTS,
  OTP_RATE_LIMIT_WINDOW,
  MESSAGE_MAX_LENGTH,

  // Types
  type PlanType,
  type PlanLimits,
  type ModerationFlag,
  type ApiError,
  type Message,
  type MessageRole,
  type ContentType,
  type SupportedLanguage,
  type ReportReason,
} from "@yaari/shared";
