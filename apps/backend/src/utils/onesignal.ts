/**
 * OneSignal REST API Utility
 *
 * File: apps/backend/src/utils/onesignal.ts
 */

import { env } from "../config/env.js";

const ONESIGNAL_API_URL = "https://api.onesignal.com";

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Key ${env.ONESIGNAL_REST_API_KEY}`,
  };
}

// ─── SEND NOTIFICATION TO SPECIFIC USERS ─────────────────

interface SendNotificationOptions {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  url?: string;
  smallIcon?: string;
}

export async function sendNotificationToUsers(
  options: SendNotificationOptions
): Promise<{ success: boolean; id?: string; errors?: any }> {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
    console.warn("⚠️ OneSignal not configured — skipping notification");
    return { success: false, errors: "OneSignal not configured" };
  }

  try {
    const response = await fetch(`${ONESIGNAL_API_URL}/notifications`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        include_aliases: { external_id: options.userIds },
        target_channel: "push",
        headings: { en: options.title },
        contents: { en: options.body },
        data: options.data || {},
        url: options.url,
        small_icon: options.smallIcon || "ic_notification",
      }),
    });

    const result: any = await response.json();
    if (result.errors) {
      console.error("OneSignal send error:", result.errors);
      return { success: false, errors: result.errors };
    }
    return { success: true, id: result.id };
  } catch (error) {
    console.error("OneSignal API error:", error);
    return { success: false, errors: (error as Error).message };
  }
}

// ─── SEND NOTIFICATION BY FILTERS (TAG-BASED) ───────────

interface TagFilter {
  field: "tag";
  key: string;
  relation: "=" | "!=" | ">" | "<" | "exists" | "not_exists";
  value?: string;
}

interface SendFilteredNotificationOptions {
  filters: (TagFilter | { operator: "AND" | "OR" })[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

export async function sendNotificationByFilters(
  options: SendFilteredNotificationOptions
): Promise<{ success: boolean; id?: string; errors?: any }> {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
    return { success: false, errors: "OneSignal not configured" };
  }

  try {
    const response = await fetch(`${ONESIGNAL_API_URL}/notifications`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        app_id: env.ONESIGNAL_APP_ID,
        filters: options.filters,
        headings: { en: options.title },
        contents: { en: options.body },
        data: options.data || {},
        small_icon: "ic_notification",
      }),
    });

    const result: any = await response.json();
    if (result.errors) {
      console.error("OneSignal filter send error:", result.errors);
      return { success: false, errors: result.errors };
    }
    return { success: true, id: result.id };
  } catch (error) {
    console.error("OneSignal API error:", error);
    return { success: false, errors: (error as Error).message };
  }
}

// ─── UPDATE USER TAGS (SERVER-SIDE) ──────────────────────

export async function updateUserTags(
  externalUserId: string,
  tags: Record<string, string | number>
): Promise<boolean> {
  if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${ONESIGNAL_API_URL}/apps/${env.ONESIGNAL_APP_ID}/users/by/external_id/${externalUserId}`,
      {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ properties: { tags } }),
      }
    );

    const result: any = await response.json();
    return !result.errors;
  } catch (error) {
    console.error("OneSignal tag update error:", error);
    return false;
  }
}

// ─── NOTIFICATION TEMPLATES ──────────────────────────────

export const NOTIFICATION_TEMPLATES = {
  inactive_short: [
    { title: "{character} misses you 🥺", body: "She's been waiting... come back and say hi?" },
    { title: "Your chat buddy is lonely 💬", body: "It's been a while. Pick up where you left off!" },
  ],
  inactive_long: [
    { title: "We saved your chats ❤️", body: "Your companions still remember everything. Come back!" },
    { title: "Long time no see! 👋", body: "Your AI friends miss your conversations" },
  ],
  upgrade_nudge: [
    { title: "Unlock all characters 🔓", body: "Pro gives you unlimited chats + photos. Try for ₹1!" },
  ],
} as const;

export function getRandomTemplate(category: keyof typeof NOTIFICATION_TEMPLATES) {
  const templates = NOTIFICATION_TEMPLATES[category];
  return { ...templates[Math.floor(Math.random() * templates.length)] };
}

export function personalizeTemplate(
  template: { title: string; body: string },
  characterName: string = "Kavya"
): { title: string; body: string } {
  return {
    title: template.title.replace("{character}", characterName),
    body: template.body.replace("{character}", characterName),
  };
}
