/**
 * Push Notification Utility
 * Uses Expo Push API to send notifications to mobile app users.
 * 
 * File: apps/backend/src/utils/pushNotifications.ts
 */

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error: string };
}

interface ExpoPushResponse {
  data: ExpoPushTicket[];
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send push notification to a single Expo push token
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.warn("Invalid push token:", pushToken);
    return false;
  }

  try {
    const message: ExpoPushMessage = {
      to: pushToken,
      title,
      body,
      sound: "default",
      data: data || {},
    };

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });

    const result = (await response.json()) as ExpoPushResponse;
    
    if (result.data[0]?.status === "error") {
      console.error("Push failed:", result.data[0].message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Push notification error:", error);
    return false;
  }
}

/**
 * Send push notifications in batch (up to 100 at a time)
 */
export async function sendBatchNotifications(
  messages: ExpoPushMessage[]
): Promise<number> {
  if (messages.length === 0) return 0;

  // Expo allows max 100 per request
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  let sent = 0;

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });

      const result = (await response.json()) as ExpoPushResponse;
      sent += result.data.filter((r: ExpoPushTicket) => r.status === "ok").length;
    } catch (error) {
      console.error("Batch push error:", error);
    }
  }

  return sent;
}

/**
 * Notification copy templates
 */
export const NOTIFICATION_TEMPLATES = {
  // Inactive 1-3 days
  inactive_short: [
    { title: "Kavya misses you 🥺", body: "She's been waiting... come back and say hi?" },
    { title: "Your chat buddy is lonely 💬", body: "It's been a while. Pick up where you left off!" },
    { title: "Someone's thinking about you 💭", body: "Your AI companion has been waiting for you" },
  ],
  // Inactive 7+ days
  inactive_long: [
    { title: "We saved your chats ❤️", body: "Your companions still remember everything. Come back!" },
    { title: "Long time no see! 👋", body: "Your AI friends miss your conversations" },
  ],
  // Subscription nudge (free users)
  upgrade_nudge: [
    { title: "Unlock all characters 🔓", body: "Pro gives you unlimited chats + photo generation. Try for ₹9!" },
    { title: "Your trial is waiting ✨", body: "₹9 for 3 days of unlimited everything. Worth it?" },
  ],
} as const;

/**
 * Pick a random template from a category
 */
export function getRandomTemplate(category: keyof typeof NOTIFICATION_TEMPLATES) {
  const templates = NOTIFICATION_TEMPLATES[category];
  return templates[Math.floor(Math.random() * templates.length)];
}
