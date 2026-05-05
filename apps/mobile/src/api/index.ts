// Re-export shared types so screens can import from "../api"
export type {
  User,
  Character,
  CharacterDetail,
  Conversation,
  Message,
  PlanType,
  SubscriptionDetail,
  AuthResponse,
  OtpResponse,
  CharacterListResponse,
  MessagesResponse,
  SendMessageResponse,
  CreateSubscriptionResponse,
  UserProfile,
  ApiError,
  MemoryItem,
  MemoryResponse,
  SuggestionsResponse,
  ReportReason,
  ReportRequest,
} from "@yaari/shared";

export {
  PLAN_LIMITS,
  PLAN_PRICING,
  TRIAL_CONFIG,
  canSendMessage,
  canGenerateImage,
  isFeatureAvailable,
  formatPhone,
  SUPPORTED_LANGUAGES,
  API_ERROR_CODES,
} from "@yaari/shared";

// Local API services
export { api, API_BASE } from "./client";
export { authApi } from "./auth";
export { charactersApi } from "./characters";
export { chatApi } from "./chat";
export { paymentsApi } from "./paymentsApi";
export { userApi } from "./users";
