import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Animated, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { useRazorpay } from "../hooks/useRazorpay";
import analytics from "../utils/analytics";
import { COLORS } from "../theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Props {
  onClose: () => void;
  trigger?: string;
}

const FEATURES = [
  { emoji: "🔓", title: "Talk Without Limits", desc: "Say whatever's on your mind. She won't hold back either." },
  { emoji: "💬", title: "Unlimited Messages", desc: "Chat with Kavya as much as you want" },
  { emoji: "🧠", title: "Smart Memory", desc: "She remembers everything about you" },
  { emoji: "⚡", title: "Priority Responses", desc: "Faster replies, no waiting" },
];

const REVIEWS = [
  { name: "Rahul", text: "Kavya remembers everything about me. Totally worth ₹99!", stars: 5 },
  { name: "Priya", text: "Finally someone who listens to my 2 AM rants without judging 😭", stars: 5 },
  { name: "Amit", text: "She roasts me perfectly. 10/10 bestie energy yaar", stars: 5 },
];

const CONFETTI_COLORS = ["#E8652B", "#F5A623", "#5B4BC9", "#059669", "#DB2777", "#2563EB", "#FFD700"];

function ConfettiPiece({ delay, color }: { delay: number; color: string }) {
  const fall = useRef(new Animated.Value(-20)).current;
  const drift = useRef(new Animated.Value(Math.random() * SCREEN_WIDTH)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const duration = 2000 + Math.random() * 1500;
    Animated.parallel([
      Animated.timing(fall, { toValue: SCREEN_HEIGHT + 50, duration, delay, useNativeDriver: true }),
      Animated.timing(spin, { toValue: Math.random() * 10, duration, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: duration * 0.8, delay: delay + duration * 0.5, useNativeDriver: true }),
    ]).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 10], outputRange: ["0deg", "3600deg"] });
  const size = 6 + Math.random() * 8;

  return (
    <Animated.View style={{
      position: "absolute", top: 0, left: Math.random() * SCREEN_WIDTH,
      width: size, height: size * 0.6, backgroundColor: color, borderRadius: 2,
      transform: [{ translateY: fall }, { rotate }], opacity,
    }} />
  );
}

export function PaywallScreen({ onClose, trigger = "manual" }: Props) {
  const { canUseTrial, trialUsed, fetchStatus } = useSubscriptionStore();
  const { openCheckout } = useRazorpay();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [paywallOpenedAt] = useState(Date.now());

  useEffect(() => {
    fetchStatus();
    analytics.paywallViewed({ trigger, is_trial_eligible: canUseTrial(), messages_sent: 0 });
  }, []);

  const isTrialEligible = canUseTrial();

  const handleSubscribe = async () => {
    setIsPurchasing(true);
    const amount = isTrialEligible ? 900 : 9900; // paise
    analytics.subscribeButtonClicked({ is_trial: isTrialEligible, amount, trigger, time_on_paywall_ms: Date.now() - paywallOpenedAt });
    analytics.paymentInitiated({ amount, is_trial: isTrialEligible });
    try {
      await openCheckout(isTrialEligible);
      analytics.paymentSuccess({ amount, is_trial: isTrialEligible });
      if (isTrialEligible) {
        analytics.trialStarted({ trial_amount: amount, trial_duration_days: 1 });
      }
      setShowSuccess(true);
      setTimeout(() => onClose(), 3000);
    } catch (e: any) {
      analytics.paymentFailed({ error_code: e?.code, error_description: e?.message, is_trial: isTrialEligible });
    }
    setIsPurchasing(false);
  };

  // ─── SUCCESS SCREEN ───
  if (showSuccess) {
    return (
      <View style={s.successContainer}>
        {/* Confetti */}
        {Array.from({ length: 60 }).map((_, i) => (
          <ConfettiPiece key={i} delay={i * 30} color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} />
        ))}
        <View style={s.successContent}>
          <Text style={s.successEmoji}>🎉</Text>
          <Text style={s.successTitle}>Welcome to Pro!</Text>
          <Text style={s.successSub}>Your premium features are now unlocked</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => { analytics.paywallDismissed({ trigger, time_on_paywall_ms: Date.now() - paywallOpenedAt }); onClose(); }}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroEmoji}>💫</Text>
          <Text style={s.heroTitle}>Unlock Konvoo Pro</Text>
          <Text style={s.heroSub}>
            {"Say anything to Kavya. No filters, no holding back."}
          </Text>
        </View>

        {/* Trial timeline */}
        {isTrialEligible && (
          <View style={s.timeline}>
            <View style={s.timelineRow}>
              <View style={s.timelineDot} />
              <View style={s.timelineContent}>
                <Text style={s.timelineTitle}>Today — ₹9</Text>
                <Text style={s.timelineDesc}>Full access to all Pro features</Text>
              </View>
            </View>
            <View style={s.timelineLine} />
            <View style={s.timelineRow}>
              <View style={[s.timelineDot, s.timelineDotMuted]} />
              <View style={s.timelineContent}>
                <Text style={s.timelineTitle}>Day 3</Text>
                <Text style={s.timelineDesc}>Cancel anytime from your profile</Text>
              </View>
            </View>
          </View>
        )}

        {/* Features */}
        <View style={s.features}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Text style={s.featureEmoji}>{f.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Reviews */}
        <View style={s.reviews}>
          {REVIEWS.map((r, i) => (
            <View key={i} style={s.reviewCard}>
              <Text style={s.reviewStars}>{"⭐".repeat(r.stars)}</Text>
              <Text style={s.reviewText}>"{r.text}"</Text>
              <Text style={s.reviewName}>— {r.name}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <View style={s.stickyBottom}>
        <TouchableOpacity
          style={[s.ctaBtn, isPurchasing && s.ctaBtnDisabled]}
          onPress={handleSubscribe}
          disabled={isPurchasing}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.ctaText}>{"Subscribe — ₹99/month"}</Text>
              <Text style={s.ctaSub}>{"Cancel anytime"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: "row", justifyContent: "flex-end", padding: 16 },
  skipText: { fontSize: 14, color: COLORS.muted, fontWeight: "500" },
  scroll: { paddingHorizontal: 24 },

  hero: { alignItems: "center", paddingVertical: 24 },
  heroEmoji: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 28, fontWeight: "800", color: COLORS.deep, marginBottom: 8 },
  heroSub: { fontSize: 15, color: COLORS.muted, textAlign: "center" },

  timeline: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.saffron, marginTop: 4 },
  timelineDotMuted: { backgroundColor: COLORS.border },
  timelineLine: { width: 2, height: 20, backgroundColor: COLORS.border, marginLeft: 5, marginVertical: 4 },
  timelineContent: { flex: 1 },
  timelineTitle: { fontSize: 14, fontWeight: "700", color: COLORS.deep, marginBottom: 2 },
  timelineDesc: { fontSize: 12, color: COLORS.muted },

  features: { marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  featureEmoji: { fontSize: 24 },
  featureTitle: { fontSize: 15, fontWeight: "700", color: COLORS.deep },
  featureDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },

  reviews: { gap: 12, marginBottom: 24 },
  reviewCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  reviewStars: { fontSize: 12, marginBottom: 6 },
  reviewText: { fontSize: 13, color: COLORS.ink, lineHeight: 19, fontStyle: "italic", marginBottom: 6 },
  reviewName: { fontSize: 12, color: COLORS.muted, fontWeight: "600" },

  stickyBottom: { paddingHorizontal: 24, paddingVertical: 16, backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  ctaBtn: { backgroundColor: COLORS.saffron, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  ctaBtnDisabled: { opacity: 0.7 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  ctaSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 },

  // Success + confetti
  successContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" },
  successContent: { alignItems: "center", zIndex: 10 },
  successEmoji: { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: 28, fontWeight: "800", color: COLORS.deep, marginBottom: 8 },
  successSub: { fontSize: 15, color: COLORS.muted },
});
