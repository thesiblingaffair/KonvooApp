import { create } from "zustand";
import { paymentsApi, type PlanType, type SubscriptionStatus } from "../api/paymentsApi";

interface SubscriptionState {
  plan: PlanType;
  status: string;
  expiresAt: string | null;
  isTrial: boolean;
  trialEndsAt: string | null;
  trialUsed: boolean;
  limits: {
    messageLimit: number;
    monthlyImages: number;
    voiceEnabled: boolean;
    customCharacters: boolean;
  };
  usage: {
    messagesSent: number;
    monthlyImages: number;
  };
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  subscribe: (useTrial?: boolean) => Promise<any>;
  cancel: () => Promise<void>;

  // Helpers
  canSendMessage: () => boolean;
  canGenerateImage: () => boolean;
  isFeatureAvailable: (feature: "voice" | "customCharacters") => boolean;
  canUseTrial: () => boolean;
  trialDaysRemaining: () => number;
}

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  plan: "free",
  status: "active",
  expiresAt: null,
  isTrial: false,
  trialEndsAt: null,
  trialUsed: false,
  limits: {
    messageLimit: 50,
    monthlyImages: 12,
    voiceEnabled: false,
    customCharacters: false,
  },
  usage: {
    messagesSent: 0,
    monthlyImages: 0,
  },
  isLoading: false,
  error: null,

  fetchStatus: async () => {
    set({ isLoading: true });
    try {
      const data = await paymentsApi.getStatus();
      set({
        plan: data.plan,
        status: data.status,
        expiresAt: data.expiresAt,
        isTrial: data.isTrial,
        trialEndsAt: data.trialEndsAt,
        trialUsed: data.trialUsed,
        limits: data.limits,
        usage: data.usage,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.error });
    }
  },

  subscribe: async (useTrial = false) => {
    set({ isLoading: true, error: null });
    try {
      const data = await paymentsApi.createSubscription("pro", useTrial);
      set({ isLoading: false });
      return data;
    } catch (err: any) {
      set({ isLoading: false, error: err.error });
      throw err;
    }
  },

  cancel: async () => {
    set({ isLoading: true });
    try {
      await paymentsApi.cancel();
      set({ isLoading: false, status: "cancelled" });
    } catch (err: any) {
      set({ isLoading: false, error: err.error });
    }
  },

  canSendMessage: () => {
    const { limits, usage, plan } = get();
    if (plan === "pro") return true;
    return usage.messagesSent < limits.messageLimit;
  },

  canGenerateImage: () => {
    const { limits, usage } = get();
    return usage.monthlyImages < limits.monthlyImages;
  },

  isFeatureAvailable: (feature) => {
    const { limits } = get();
    return feature === "voice" ? limits.voiceEnabled : limits.customCharacters;
  },

  canUseTrial: () => {
    const { trialUsed, plan } = get();
    return !trialUsed && plan === "free";
  },

  trialDaysRemaining: () => {
    const { isTrial, trialEndsAt } = get();
    if (!isTrial || !trialEndsAt) return 0;
    const remaining = new Date(trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  },
}));
