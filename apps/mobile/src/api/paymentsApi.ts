import { api } from "./client";
import type { PlanType } from "@yaari/shared";

export type { PlanType } from "@yaari/shared";

export interface SubscriptionStatus {
  plan: PlanType;
  usage: { messagesSent: number };
  limits: { messageLimit: number };
  isTrial: boolean;
  trialUsed: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
}

export const paymentsApi = {
  /** Get current subscription status */
  getStatus: () => api.get<SubscriptionStatus>("/subscriptions/status"),

  /** Create a new subscription */
  createSubscription: (plan: string, useTrial: boolean = false) =>
    api.post<{
      subscriptionId: string;
      shortUrl: string;
      amount: number;
      razorpayConfig: any;
    }>("/subscriptions/create", { plan, useTrial }),

  /** Cancel current subscription */
  cancel: () => api.post("/subscriptions/cancel"),
};
