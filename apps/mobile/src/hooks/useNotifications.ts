/**
 * Push Notification Hook — OneSignal Integration
 *
 * File: apps/mobile/src/hooks/useNotifications.ts
 *
 * Handles:
 *  - OneSignal initialization on app open
 *  - Permission prompt (before login)
 *  - Logging in the user (external_id) after authentication
 *  - Setting tags for segmentation (plan, character, activity)
 *  - Handling notification tap → deep link
 */

import { useEffect, useRef } from "react";
import { OneSignal } from "react-native-onesignal";
import { useAuthStore } from "../stores/authStore";
import { useSubscriptionStore } from "../stores/subscriptionStore";

// Re-export from utils (for backward compat with app.tsx imports)
export { logoutOneSignal, setOneSignalTag, setOneSignalTags } from "../utils/onesignal";

const ONESIGNAL_APP_ID = "769a6414-bb11-4450-8b77-bb056bac4b66";

/**
 * Initialize OneSignal and manage user identity + tags.
 * Call once in App root component.
 */
export function useNotifications() {
  const { isAuthenticated, user } = useAuthStore();
  const { plan } = useSubscriptionStore();
  const initialized = useRef(false);

  // ─── Step 1: Initialize OneSignal on app open ───────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);

    OneSignal.Notifications.addEventListener("click", (event) => {
      const data = event.notification.additionalData as Record<string, any> | undefined;
      console.log("👆 Notification tapped:", data);
    });

    console.log("✅ OneSignal initialized");
  }, []);

  // ─── Step 2: Login user to OneSignal after authentication ──
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    OneSignal.login(user.id);
    console.log("✅ OneSignal user logged in:", user.id);

    OneSignal.User.addTags({
      user_id: user.id,
      user_name: user.name || "unknown",
      language: user.language || "hi",
    });
  }, [isAuthenticated, user?.id]);

  // ─── Step 3: Sync plan tag whenever subscription changes ──
  useEffect(() => {
    if (!isAuthenticated) return;

    OneSignal.User.addTag("plan", plan || "free");
    console.log("🏷️ OneSignal tag updated — plan:", plan);
  }, [isAuthenticated, plan]);
}
