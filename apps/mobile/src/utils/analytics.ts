/**
 * Centralized Analytics for Konvoo Mobile App
 * 
 * 61+ events across all screens. Sends to GA4, PostHog, Meta.
 * All events auto-include user properties + timestamp.
 * 
 * Usage:
 *   import analytics from '../utils/analytics';
 *   analytics.messageSent({ conversation_id: '...', character_name: 'Kavya', message_length: 42 });
 */
import { Platform } from "react-native";

// ─── CONFIG ────────────────────────────────────────────
const GA4_MEASUREMENT_ID = "G-T1W8CE84ED";
const GA4_API_SECRET = "";
const POSTHOG_KEY = "phc_i5gwHUy4vI479cOrnd55r9HrOJNXBpHMpd2nZ0x71OP";
const POSTHOG_HOST = "https://us.i.posthog.com";
const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const APP_VERSION = "1.2.1";

// ─── STATE ─────────────────────────────────────────────
let clientId: string | null = null;
let userId: string | null = null;
let userProps: Record<string, any> = {};
let sessionId: string | null = null;
let sessionStartTime: number = Date.now();
let messagesInSession = 0;

function getClientId(): string {
  if (clientId) return clientId;
  clientId = `${Date.now()}.${Math.random().toString(36).substring(2, 9)}`;
  return clientId;
}

function getSessionId(): string {
  if (!sessionId) sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return sessionId;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

// ─── USER PROPERTIES ───────────────────────────────────
// Set once, auto-attached to every event

export function setUserId(id: string) {
  userId = id;
  userProps.user_id = id;
}

export function setUserProperties(props: Record<string, any>) {
  userProps = { ...userProps, ...props };
}

function getBaseProps(): Record<string, any> {
  return {
    user_id: userId || undefined,
    platform: Platform.OS,
    app_version: APP_VERSION,
    session_id: getSessionId(),
    timestamp: getTimestamp(),
    // Trial properties always attached
    plan: userProps.plan || "free",
    is_trial: userProps.is_trial || false,
    trial_used: userProps.trial_used || false,
    trial_started: userProps.trial_started || null,
    trial_paused: userProps.trial_paused || null,
    trial_ended: userProps.trial_ended || null,
    trial_amount: userProps.trial_amount || null,
    language: userProps.language || "hinglish",
    days_since_signup: userProps.days_since_signup || 0,
    days_since_last_chat: userProps.days_since_last_chat || 0,
    total_messages_sent: userProps.total_messages_sent || 0,
  };
}

// ─── SENDERS ───────────────────────────────────────────

async function sendToGA4(eventName: string, params: Record<string, any>) {
  try {
    const url = `${GA4_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: getClientId(),
        user_id: userId || undefined,
        events: [{ name: eventName, params: { ...params, engagement_time_msec: 100 } }],
        user_properties: Object.keys(userProps).length > 0
          ? Object.fromEntries(Object.entries(userProps).map(([k, v]) => [k, { value: String(v) }]))
          : undefined,
      }),
    }).catch(() => {});
  } catch {}
}

async function sendToPostHog(eventName: string, params: Record<string, any>) {
  try {
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: eventName,
        properties: { ...params, distinct_id: userId || getClientId(), $lib: "konvoo-mobile", $os: Platform.OS },
        timestamp: getTimestamp(),
      }),
    }).catch(() => {});
  } catch {}
}

// ─── CORE TRACK ────────────────────────────────────────

function track(eventName: string, eventProps: Record<string, any> = {}) {
  const sanitized = eventName.slice(0, 40).replace(/[^a-zA-Z0-9_]/g, "_");
  const fullProps = { ...getBaseProps(), ...eventProps };

  if (__DEV__) console.log(`📊 ${sanitized}`, fullProps);

  sendToGA4(sanitized, fullProps);
  sendToPostHog(sanitized, fullProps);
}

// ═══════════════════════════════════════════════════════
// ALL 65 EVENTS
// ═══════════════════════════════════════════════════════

const analytics = {
  track,
  setUserId,
  setUserProperties,

  // ─── SESSION & LIFECYCLE ─────────────────────────────

  appOpened: (p: { open_type: "cold_start" | "resume"; notification_source?: string }) => {
    sessionId = null; // New session
    sessionStartTime = Date.now();
    messagesInSession = 0;
    track("app_opened", { ...p, device_model: "", os_version: "" });
  },

  sessionStarted: (p: { source?: string; sessions_count?: number }) =>
    track("session_started", p),

  sessionEnded: () =>
    track("session_ended", {
      session_duration_ms: Date.now() - sessionStartTime,
      messages_sent_in_session: messagesInSession,
    }),

  serverWakeTimeout: (p: { wait_time_ms: number; retry_count: number }) =>
    track("server_wake_timeout", p),

  // ─── ONBOARDING ──────────────────────────────────────

  welcomeScreenViewed: () =>
    track("welcome_screen_viewed", { is_first_open: true }),

  welcomeCtaClicked: (p: { time_on_screen_ms: number }) =>
    track("welcome_cta_clicked", p),

  phoneScreenViewed: () =>
    track("phone_screen_viewed"),

  otpRequested: (p: { phone_number: string; is_resend: boolean; resend_count?: number }) =>
    track("otp_requested", p),

  otpRequestFailed: (p: { phone_number: string; error_code: string; error_message: string }) =>
    track("otp_request_failed", p),

  otpScreenViewed: (p: { phone_number: string }) =>
    track("otp_screen_viewed", p),

  otpVerified: (p: { phone_number: string; is_new_user: boolean; verification_time_ms?: number }) =>
    track("otp_verified", p),

  otpVerificationFailed: (p: { phone_number: string; error_code: string; attempt_number?: number }) =>
    track("otp_verification_failed", p),

  otpResendClicked: (p: { phone_number: string; resend_count: number }) =>
    track("otp_resend_clicked", p),

  nameScreenViewed: () =>
    track("name_screen_viewed"),

  nameSubmitted: (p: { name_length: number }) =>
    track("name_submitted", p),

  languageScreenViewed: () =>
    track("language_screen_viewed"),

  languageSelected: (p: { language_code: string; language_name: string }) =>
    track("language_selected", p),

  onboardingCompleted: (p: { user_name: string; language: string; total_onboarding_time_ms?: number }) =>
    track("onboarding_completed", p),

  onboardingFailed: (p: { error_message: string }) =>
    track("onboarding_failed", p),

  // ─── CHAT ────────────────────────────────────────────

  chatScreenViewed: (p: { character_name: string; conversation_id: string; messages_sent_lifetime?: number }) =>
    track("chat_screen_viewed", p),

  chatLoadFailed: (p: { error_code: string; error_message?: string }) =>
    track("chat_load_failed", p),

  chatRetryClicked: (p: { retry_count: number }) =>
    track("chat_retry_clicked", p),

  messageSent: (p: { conversation_id: string; character_name: string; message_length: number; message_source: "typed" | "suggestion"; messages_in_session?: number }) => {
    messagesInSession++;
    track("message_sent", { ...p, messages_in_session: messagesInSession });
  },

  messageReceived: (p: { conversation_id: string; character_name: string; response_length?: number; response_time_ms?: number; has_image?: boolean }) =>
    track("message_received", p),

  suggestionPanelToggled: (p: { action: "opened" | "closed"; conversation_id: string }) =>
    track("suggestion_panel_toggled", p),

  suggestionTapped: (p: { suggestion_text: string; suggestion_index: number; conversation_id: string }) =>
    track("suggestion_tapped", p),

  chatMenuOpened: (p: { conversation_id: string; character_name: string }) =>
    track("chat_menu_opened", p),

  memoryViewed: (p: { conversation_id: string; character_name: string; memory_count: number }) =>
    track("memory_viewed", p),

  chatResetInitiated: (p: { conversation_id: string; character_name: string }) =>
    track("chat_reset_initiated", p),

  chatResetConfirmed: (p: { conversation_id: string; character_name: string; total_messages_before_reset?: number }) =>
    track("chat_reset_confirmed", p),

  chatReported: (p: { conversation_id: string; character_name: string; reason: string }) =>
    track("chat_reported", p),

  chatDeleted: (p: { conversation_id: string; character_name: string }) =>
    track("chat_deleted", p),

  messageLimitReached: (p: { messages_sent: number; message_limit: number; character_name: string }) =>
    track("message_limit_reached", p),

  // ─── PAYWALL & SUBSCRIPTION ──────────────────────────

  paywallViewed: (p: { trigger: string; is_trial_eligible: boolean; messages_sent?: number }) =>
    track("paywall_viewed", p),

  paywallDismissed: (p: { trigger: string; time_on_paywall_ms: number }) =>
    track("paywall_dismissed", p),

  subscribeButtonClicked: (p: { is_trial: boolean; amount: number; trigger?: string; time_on_paywall_ms?: number }) =>
    track("subscribe_btn_clicked", p),

  paymentInitiated: (p: { amount: number; is_trial: boolean; razorpay_subscription_id?: string }) =>
    track("payment_initiated", p),

  paymentSuccess: (p: { amount: number; is_trial: boolean; razorpay_payment_id?: string; payment_method?: string; time_to_convert_days?: number; messages_before_conversion?: number }) =>
    track("payment_success", p),

  paymentFailed: (p: { error_code?: string; error_description?: string; is_trial: boolean }) =>
    track("payment_failed", p),

  trialStarted: (p: { trial_amount: number; trial_duration_days: number }) =>
    track("trial_started", p),

  trialPaused: (p: { trial_amount: number; days_used: number; reason?: string }) =>
    track("trial_paused", p),

  trialEnded: (p: { trial_amount: number; converted_to_paid: boolean; total_messages_during_trial: number }) =>
    track("trial_ended", p),

  subscriptionActivated: (p: { amount: number; is_trial: boolean; razorpay_sub_id?: string; expires_at?: string }) =>
    track("subscription_activated", p),

  subscriptionCancelled: (p: { cancellation_reason: string; subscription_duration_days?: number; total_messages_during_sub?: number }) =>
    track("subscription_cancelled", p),

  // ─── PROFILE & SETTINGS ──────────────────────────────

  profileScreenViewed: (p: { character_name?: string }) =>
    track("profile_screen_viewed", p),

  characterAvatarTapped: (p: { character_name: string }) =>
    track("character_avatar_tapped", p),

  nicknameChanged: (p: { old_nickname: string; new_nickname: string }) =>
    track("nickname_changed", p),

  settingsScreenViewed: () =>
    track("settings_screen_viewed"),

  planCardTapped: (p: { current_plan: string }) =>
    track("plan_card_tapped", p),

  soundToggleChanged: (p: { sound_enabled: boolean }) =>
    track("sound_toggle_changed", p),

  linkClicked: (p: { link_type: "support" | "privacy" | "terms" }) =>
    track("link_clicked", p),

  logoutInitiated: () =>
    track("logout_initiated"),

  logoutConfirmed: (p: { session_duration_ms?: number }) =>
    track("logout_confirmed", p),

  resetKavyaInitiated: () =>
    track("reset_kavya_initiated"),

  resetKavyaConfirmed: (p: { total_messages_before_reset?: number }) =>
    track("reset_kavya_confirmed", p),

  deleteAccountInitiated: () =>
    track("delete_account_initiated"),

  deleteAccountConfirmed: (p: { was_paying_user?: boolean }) =>
    track("delete_account_confirmed", p),

  // ─── NOTIFICATIONS ───────────────────────────────────

  pushPermissionRequested: () =>
    track("push_permission_requested"),

  pushPermissionGranted: () =>
    track("push_permission_granted"),

  pushPermissionDenied: () =>
    track("push_permission_denied"),

  pushNotificationReceived: (p: { notification_type?: string; notification_title?: string }) =>
    track("push_notif_received", p),

  pushNotificationTapped: (p: { notification_type?: string; notification_title?: string; time_since_last_active_hrs?: number }) =>
    track("push_notif_tapped", p),

  // ─── ENGAGEMENT ──────────────────────────────────────

  daysSinceLastChat: (p: { days_since_last_chat: number; last_chat_date?: string; character_name?: string; last_chat_character?: string; total_lifetime_messages?: number }) => {
    setUserProperties({ days_since_last_chat: String(p.days_since_last_chat) });
    track("days_since_last_chat", p);
  },

  // ─── TRUECALLER ────────────────────────────────────

  truecallerAutoTriggered: (p: { is_available: boolean }) =>
    track("truecaller_auto_triggered", p),

  truecallerBtnClicked: (p: { source: "manual_tap" }) =>
    track("truecaller_btn_clicked", p),

  truecallerSuccess: (p: { phone_last4: string; has_name: boolean; source: "auto_popup" | "manual_tap" }) =>
    track("truecaller_success", p),

  truecallerDismissed: (p: { error: string; source: "auto_popup" | "manual_tap" }) =>
    track("truecaller_dismissed", p),

  truecallerVerifyFailed: (p: { error: string }) =>
    track("truecaller_verify_failed", p),

  // ─── SCREEN VIEWS (generic) ──────────────────────────

  screenView: (screenName: string) =>
    track("screen_view", { screen_name: screenName }),
};

export default analytics;
