import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useRazorpay } from "../hooks";
import analytics from "../utils/analytics";

interface Props {
  onClose: () => void;
  trigger?: string;
}

const PRO_FEATURES = [
  { emoji: "💬", text: "Unlimited messages" },
  { emoji: "📸", text: "100 images/month" },
  { emoji: "🎤", text: "Voice chat" },
  { emoji: "✨", text: "All characters unlocked" },
  { emoji: "🧑‍🎨", text: "Create custom characters" },
  { emoji: "⚡", text: "Priority responses" },
];

export function PaywallScreen({ onClose, trigger = "manual" }: Props) {
  const {
    plan: currentPlan, usage, limits, isTrial,
    trialUsed, fetchStatus, isLoading: storeLoading,
    canUseTrial, trialDaysRemaining,
  } = useSubscriptionStore();
  const { openCheckout } = useRazorpay();
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    fetchStatus();
    analytics.paywallViewed(trigger);
  }, []);

  // Determine if this is a trial-eligible user
  const isTrialEligible = canUseTrial();

  const triggerMessages: Record<string, { title: string; sub: string }> = {
    messages: {
      title: "You've used all your free messages",
      sub: `${usage.messagesSent}/${limits.messageLimit} lifetime messages sent. Upgrade for unlimited!`,
    },
    images: {
      title: "Image limit reached",
      sub: `${usage.monthlyImages}/${limits.monthlyImages} images this month. Get more with Pro!`,
    },
    premium: {
      title: "This is a premium character",
      sub: "Upgrade to Pro to unlock all characters",
    },
    manual: {
      title: "Unlock the full experience",
      sub: "Unlimited conversations. More photos. All characters.",
    },
  };

  const { title, sub } = triggerMessages[trigger];

  const handleSubscribe = async () => {
    setIsPurchasing(true);
    try {
      await openCheckout(isTrialEligible);
      await fetchStatus();
      analytics.subscriptionStarted("pro", isTrialEligible, isTrialEligible ? 900 : 19900);
      Alert.alert(
        isTrialEligible ? "Trial Started!" : "Welcome to Pro!",
        isTrialEligible
          ? "You have 3 days of unlimited access. After that, it's ₹199/month."
          : "Your Pro subscription is now active. Enjoy unlimited chatting!",
        [{ text: "Let's go!", onPress: onClose }]
      );
    } catch (error) {
      Alert.alert("Payment Failed", "Something went wrong. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <View style={s.container}>
      {/* Close button */}
      <TouchableOpacity style={s.closeBtn} onPress={onClose}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={s.emoji}>✨</Text>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{sub}</Text>

        {/* Pro features */}
        <View style={s.featuresCard}>
          <Text style={s.proLabel}>YAARI PRO</Text>
          {PRO_FEATURES.map((feature, i) => (
            <View key={i} style={s.featureRow}>
              <Text style={s.featureEmoji}>{feature.emoji}</Text>
              <Text style={s.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {/* Single pricing card */}
        <View style={[s.pricingCard, s.pricingCardSelected]}>
          {isTrialEligible && (
            <View style={s.trialBadge}>
              <Text style={s.trialBadgeText}>BEST VALUE</Text>
            </View>
          )}
          {isTrialEligible ? (
            <>
              <Text style={s.pricingTitle}>Start with 3-day Trial</Text>
              <View style={s.priceRow}>
                <Text style={s.priceAmount}>₹9</Text>
                <Text style={s.pricePeriod}> for 3 days</Text>
              </View>
              <Text style={s.priceNote}>Then ₹199/month. Cancel anytime.</Text>
            </>
          ) : (
            <>
              <Text style={s.pricingTitle}>Yaari Pro</Text>
              <View style={s.priceRow}>
                <Text style={s.priceAmount}>₹199</Text>
                <Text style={s.pricePeriod}>/month</Text>
              </View>
              <Text style={s.priceNote}>Billed monthly. Cancel anytime.</Text>
            </>
          )}
        </View>

        {/* Trial info */}
        {isTrial && (
          <View style={s.trialInfoCard}>
            <Text style={s.trialInfoText}>
              🕐 Trial active — {trialDaysRemaining()} days remaining
            </Text>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <View style={s.ctaContainer}>
        <TouchableOpacity
          style={[s.ctaBtn, isPurchasing && s.ctaBtnDisabled]}
          onPress={handleSubscribe}
          disabled={isPurchasing || storeLoading}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.ctaText}>
              {isTrialEligible ? "Start Trial — ₹9 for 3 days" : "Subscribe — ₹199/mo"}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={s.legalText}>
          Powered by Razorpay • Cancel anytime
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121218",
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2A2A3C",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  closeText: {
    fontSize: 14,
    color: "#8A8A9A",
    fontWeight: "700",
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 140,
  },
  emoji: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#F5F5F0",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#8A8A9A",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 20,
  },
  // Features card
  featuresCard: {
    backgroundColor: "#1C1C28",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2A2A3C",
  },
  proLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#E8652B",
    letterSpacing: 2,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  featureEmoji: {
    fontSize: 18,
    marginRight: 12,
    width: 28,
    textAlign: "center",
  },
  featureText: {
    fontSize: 15,
    color: "#F5F5F0",
    fontWeight: "500",
  },
  // Pricing cards
  pricingCard: {
    backgroundColor: "#1C1C28",
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "#2A2A3C",
  },
  pricingCardSelected: {
    borderColor: "#E8652B",
    backgroundColor: "rgba(232, 101, 43, 0.06)",
  },
  pricingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  trialBadge: {
    backgroundColor: "#E8652B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  trialBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  pricingTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F5F5F0",
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#E8652B",
  },
  pricePeriod: {
    fontSize: 14,
    color: "#8A8A9A",
  },
  priceNote: {
    fontSize: 12,
    color: "#6B6B80",
    marginTop: 4,
  },
  // Trial info
  trialInfoCard: {
    backgroundColor: "rgba(232, 101, 43, 0.1)",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    alignItems: "center",
  },
  trialInfoText: {
    fontSize: 13,
    color: "#E8652B",
    fontWeight: "600",
  },
  // CTA
  ctaContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: "#121218",
    borderTopWidth: 1,
    borderTopColor: "#2A2A3C",
  },
  ctaBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#E8652B",
    alignItems: "center",
  },
  ctaBtnDisabled: {
    backgroundColor: "#3A3A4C",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  legalText: {
    fontSize: 11,
    color: "#6B6B80",
    textAlign: "center",
    marginTop: 8,
  },
});
