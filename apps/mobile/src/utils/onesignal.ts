/**
 * OneSignal Utility Functions
 * 
 * Extracted from useNotifications.ts to avoid circular imports.
 * authStore imports logoutOneSignal from here (not from the hook).
 */

import { OneSignal } from "react-native-onesignal";

/**
 * Logout from OneSignal (call on user logout)
 */
export function logoutOneSignal() {
  try {
    OneSignal.logout();
    console.log("🚪 OneSignal user logged out");
  } catch (e) {
    console.warn("OneSignal logout failed:", e);
  }
}

/**
 * Update a specific tag (call from anywhere)
 */
export function setOneSignalTag(key: string, value: string) {
  try {
    OneSignal.User.addTag(key, value);
  } catch (e) {
    console.warn("OneSignal tag update failed:", e);
  }
}

/**
 * Update multiple tags at once
 */
export function setOneSignalTags(tags: Record<string, string>) {
  try {
    OneSignal.User.addTags(tags);
  } catch (e) {
    console.warn("OneSignal tags update failed:", e);
  }
}
