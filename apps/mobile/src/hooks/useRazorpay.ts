import { useState, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useChatStore } from "../stores/chatStore";

// ─── useRazorpay ───────────────────────────────────────

export function useRazorpay() {
  const { subscribe, fetchStatus } = useSubscriptionStore();

  const openCheckout = async (useTrial: boolean = false) => {
    try {
      const data = await subscribe(useTrial);

      if (Platform.OS === "web") {
        // Web fallback
        if (typeof window !== "undefined" && (window as any).Razorpay) {
          return new Promise((resolve, reject) => {
            const rzp = new (window as any).Razorpay({
              ...data.razorpayConfig,
              handler: async (response: any) => {
                await fetchStatus();
                resolve(response);
              },
              modal: {
                ondismiss: () => reject(new Error("Payment dismissed")),
              },
            });
            rzp.open();
          });
        }
      } else {
        // React Native — use native SDK
        const RazorpayCheckout = require("react-native-razorpay").default;
        const result = await RazorpayCheckout.open(data.razorpayConfig);
        // Payment success — refresh subscription
        await fetchStatus();
        return result;
      }

      return data;
    } catch (error: any) {
      // Razorpay native SDK returns error with code and description
      if (error.code === 2) {
        // User cancelled payment
        console.log("Payment cancelled by user");
      } else {
        console.error("Razorpay checkout failed:", error);
        Alert.alert(
          "Payment Failed",
          error.description || error.error || "Something went wrong. Please try again."
        );
      }
      throw error;
    }
  };

  return { openCheckout };
}

// ─── useFloatingBubble ─────────────────────────────────

export function useFloatingBubble() {
  const { conversations } = useChatStore();
  const [dismissed, setDismissed] = useState(false);

  const recentConversation = conversations.length > 0 ? conversations[0] : null;
  const visible = !dismissed && recentConversation !== null && recentConversation.lastMessage !== null;

  const dismiss = useCallback(() => setDismissed(true), []);

  useEffect(() => {
    setDismissed(false);
  }, [recentConversation?.id]);

  return { visible, conversation: recentConversation, dismiss };
}
