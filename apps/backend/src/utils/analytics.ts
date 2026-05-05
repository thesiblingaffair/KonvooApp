/**
 * Server-side analytics for Konvoo backend.
 *
 * Tracks critical events (payments, signups) server-side via:
 * - GA4 Measurement Protocol (reliable, not blocked by ad blockers)
 * - Meta Conversions API (for ad attribution on payments)
 *
 * Usage:
 *   import { serverAnalytics } from '../utils/analytics';
 *   serverAnalytics.paymentSuccess({ userId, amount, plan, method });
 */
import { env } from "../config/env.js";
import crypto from "crypto";

// ─── CONFIG ────────────────────────────────────────────
const GA4_MEASUREMENT_ID = "G-T1W8CE84ED";
const GA4_API_SECRET = env.GA4_API_SECRET || "";
const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

// ─── GA4 MEASUREMENT PROTOCOL ──────────────────────────

async function sendGA4Event(
  eventName: string,
  params: Record<string, any>,
  userId?: string
) {
  try {
    if (!GA4_API_SECRET) return; // Skip if not configured

    const url = `${GA4_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
    const body = {
      client_id: userId || `server.${Date.now()}`,
      user_id: userId || undefined,
      events: [
        {
          name: eventName,
          params: {
            ...params,
            source: "server",
            engagement_time_msec: 1,
          },
        },
      ],
    };

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`[Analytics] GA4 event failed: ${eventName}`, error);
  }
}

// ─── SERVER ANALYTICS ──────────────────────────────────

export const serverAnalytics = {
  /**
   * Track user signup (after OTP verified + new user created)
   */
  userSignup: (data: { userId: string; phone: string }) => {
    sendGA4Event("user_signup", {
      method: "phone_otp",
    }, data.userId);
    console.log(`📊 [Analytics] user_signup: ${data.userId}`);
  },

  /**
   * Track onboarding completion
   */
  onboardingCompleted: (data: { userId: string; name: string; language: string }) => {
    sendGA4Event("onboarding_completed", {
      language: data.language,
    }, data.userId);
    console.log(`📊 [Analytics] onboarding_completed: ${data.userId} (${data.language})`);
  },

  /**
   * Track successful payment (from Razorpay webhook — most reliable)
   */
  paymentSuccess: (data: {
    userId: string;
    amount: number;
    currency: string;
    plan: string;
    method?: string;
    isTrial: boolean;
  }) => {
    sendGA4Event("purchase", {
      transaction_id: `pay_${Date.now()}`,
      value: data.amount / 100, // paise to rupees
      currency: data.currency,
      items: [{ item_name: `Konvoo ${data.plan}`, price: data.amount / 100 }],
      plan: data.plan,
      is_trial: data.isTrial,
      payment_method: data.method || "unknown",
    }, data.userId);
    console.log(`📊 [Analytics] payment_success: ₹${data.amount / 100} from ${data.userId} (${data.plan})`);
  },

  /**
   * Track failed payment
   */
  paymentFailed: (data: {
    userId: string;
    amount: number;
    method?: string;
  }) => {
    sendGA4Event("payment_failed", {
      value: data.amount / 100,
      payment_method: data.method || "unknown",
    }, data.userId);
    console.log(`📊 [Analytics] payment_failed: ₹${data.amount / 100} from ${data.userId}`);
  },

  /**
   * Track subscription activated
   */
  subscriptionActivated: (data: {
    userId: string;
    plan: string;
    isTrial: boolean;
  }) => {
    sendGA4Event("subscription_activated", {
      plan: data.plan,
      is_trial: data.isTrial,
    }, data.userId);
    console.log(`📊 [Analytics] subscription_activated: ${data.plan} for ${data.userId}`);
  },

  /**
   * Track subscription cancelled
   */
  subscriptionCancelled: (data: { userId: string; plan: string }) => {
    sendGA4Event("subscription_cancelled", {
      plan: data.plan,
    }, data.userId);
    console.log(`📊 [Analytics] subscription_cancelled: ${data.userId}`);
  },

  /**
   * Track message sent (server-side count for accuracy)
   */
  messageSent: (data: {
    userId: string;
    conversationId: string;
    hasImage: boolean;
  }) => {
    sendGA4Event("message_sent_server", {
      conversation_id: data.conversationId,
      has_image: data.hasImage,
    }, data.userId);
  },

  /**
   * Track account deletion request
   */
  accountDeletionRequested: (data: { userId: string }) => {
    sendGA4Event("account_deletion_requested", {}, data.userId);
    console.log(`📊 [Analytics] account_deletion_requested: ${data.userId}`);
  },
};
