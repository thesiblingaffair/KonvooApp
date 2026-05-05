import React, { useEffect, useState } from "react";
import { StatusBar, ActivityIndicator, View, Text, StyleSheet, AppState } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "./src/stores/authStore";
import { useSubscriptionStore } from "./src/stores/subscriptionStore";
import { useNotifications, setOneSignalTag } from "./src/hooks/useNotifications";
import analytics from "./src/utils/analytics";
import { chatApi, charactersApi } from "./src/api";

// Screens
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PaywallScreen } from "./src/screens/PaywallScreen";

// ─── TYPES ─────────────────────────────────────────────

type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Profile: undefined;
  Paywall: { trigger?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── COLORS ────────────────────────────────────────────

const C = {
  saffron: "#E8652B",
  deep: "#1A1A2E",
  muted: "#6B6B80",
  border: "#EDEDF0",
  bg: "#FAFAF8",
  card: "#FFFFFF",
};

// ─── HOME CHAT SCREEN (loads default character automatically) ───

function HomeChatScreen({ navigation }: any) {
  const [convId, setConvId] = useState<string>("");
  const [charName, setCharName] = useState<string>("Kavya");
  const [charAvatar, setCharAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    loadDefaultChat();
  }, []);

  const loadDefaultChat = async () => {
    setLoading(true);
    setError(false);
    try {
      const defaultChar = await charactersApi.getDefault();
      setCharName(defaultChar.name);
      setCharAvatar(defaultChar.avatarUrl || "");
      setOneSignalTag("last_character", defaultChar.name);

      const data = await chatApi.startConversation(defaultChar.id);
      setConvId(data.conversationId);
    } catch (error: any) {
      if (error.code === "MESSAGE_LIMIT_REACHED" || error.code === "PREMIUM_REQUIRED") {
        analytics.chatLoadFailed({ error_code: error.code });
        navigation.navigate("Paywall", { trigger: "limit" });
      } else {
        analytics.chatLoadFailed({ error_code: "server_error", error_message: error.message || "" });
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.saffron} />
      </View>
    );
  }

  if (error || !convId) {
    return (
      <View style={styles.loading}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>😴</Text>
        <Text style={{ fontSize: 16, fontWeight: "700", color: C.deep, marginBottom: 6 }}>Server is waking up...</Text>
        <Text style={{ fontSize: 13, color: C.muted, marginBottom: 20, textAlign: "center", paddingHorizontal: 40 }}>This usually takes 15-30 seconds. Tap retry below.</Text>
        <Text onPress={() => { setRetryCount(retryCount + 1); analytics.chatRetryClicked({ retry_count: retryCount + 1 }); loadDefaultChat(); }} style={{ fontSize: 15, fontWeight: "700", color: C.saffron }}>Retry →</Text>
      </View>
    );
  }

  return (
    <ChatScreen
      conversationId={convId}
      characterName={charName}
      characterAvatar={charAvatar}
      onBack={() => navigation.navigate("Profile")}
      onPaywall={() => navigation.navigate("Paywall", { trigger: "limit" })}
    />
  );
}

// ─── VERSION ───────────────────────────────────────────
const APP_VERSION = "1.2.1";

// ─── APP ROOT ──────────────────────────────────────────

export default function App() {
  const { isAuthenticated, isOnboarded } = useAuthStore();
  const { fetchStatus } = useSubscriptionStore();
  const [isReady, setIsReady] = useState(false);

  // Initialize OneSignal push notifications
  useNotifications();

  // ─── Analytics: App lifecycle ────────────────────────
  useEffect(() => {
    analytics.appOpened({ open_type: "cold_start" });

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") analytics.appOpened({ open_type: "resume" });
      if (state === "background") analytics.sessionEnded();
    });
    return () => sub.remove();
  }, []);

  // Sync user properties to analytics when auth/subscription changes
  useEffect(() => {
    if (isAuthenticated && isReady) {
      const { user } = useAuthStore.getState();
      const { plan, isTrial, trialUsed, usage } = useSubscriptionStore.getState();
      if (user?.id) analytics.setUserId(user.id);
      analytics.setUserProperties({
        user_id: user?.id || "",
        user_name: user?.name || "",
        phone: user?.phone?.slice(-4) || "",
        language: user?.language || "hinglish",
        plan: plan || "free",
        is_trial: String(isTrial || false),
        trial_used: String(trialUsed || false),
        total_messages_sent: String(usage?.messagesSent || 0),
        days_since_signup: user?.createdAt ? String(Math.floor((Date.now() - new Date(user.createdAt as any).getTime()) / 86400000)) : "0",
      });
    }
  }, [isAuthenticated, isReady]);

  // Wait for Zustand persist to rehydrate + clear old cached state
  useEffect(() => {
    const init = async () => {
      await new Promise((r) => setTimeout(r, 200));

      // One-time migration: clear old multi-character cached state
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const migrated = await AsyncStorage.getItem("konvoo_v110_migrated");
        if (!migrated) {
          // Clear old chat store cache (had multiple character conversations)
          await AsyncStorage.removeItem("chat-storage");
          await AsyncStorage.removeItem("subscription-storage");
          await AsyncStorage.setItem("konvoo_v110_migrated", "true");
          console.log("✅ Migrated to v1.1.0 — cleared old chat cache");
        }
      } catch (e) {
        console.warn("Migration check failed:", e);
      }

      setIsReady(true);
    };
    init();
  }, []);

  // Fetch subscription status when authenticated
  useEffect(() => {
    if (isAuthenticated && isReady) {
      fetchStatus().catch(() => {});
    }
  }, [isAuthenticated, isReady]);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.saffron} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated || !isOnboarded ? (
            <Stack.Screen name="Auth" component={OnboardingScreen} />
          ) : (
            <>
              <Stack.Screen name="Home" component={HomeChatScreen} />
              <Stack.Screen
                name="Profile"
                options={{ animation: "slide_from_right" }}
              >
                {({ navigation }: any) => (
                  <ProfileScreen
                    onBack={() => navigation.goBack()}
                    onPaywall={() => navigation.navigate("Paywall", { trigger: "manual" })}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Paywall"
                options={{
                  presentation: "modal",
                  animation: "slide_from_bottom",
                }}
              >
                {({ route, navigation }: any) => (
                  <PaywallScreen
                    onClose={() => navigation.goBack()}
                    trigger={route.params?.trigger || "manual"}
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.bg,
  },
});
