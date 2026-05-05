import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image,
  StyleSheet, Alert, Switch, Modal, ActivityIndicator, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import { useSubscriptionStore } from "../stores/subscriptionStore";
import { userApi, charactersApi } from "../api";
import analytics from "../utils/analytics";
import { COLORS } from "../theme";

interface Props {
  onBack: () => void;
  onPaywall: () => void;
}

export function ProfileScreen({ onBack, onPaywall }: Props) {
  const { user, logout } = useAuthStore();
  const { plan, usage, limits, isTrial, trialUsed, fetchStatus } = useSubscriptionStore();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [nickname, setNickname] = useState("Kavya");
  const [charAvatar, setCharAvatar] = useState("");
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  useEffect(() => {
    fetchStatus();
    loadCharacter();
    analytics.profileScreenViewed({ character_name: "Kavya" });
  }, []);

  const loadCharacter = async () => {
    try {
      const defaultChar = await charactersApi.getDefault();
      if (defaultChar.avatarUrl) setCharAvatar(defaultChar.avatarUrl);
    } catch (e) {}
  };

  const handleLogout = () => {
    analytics.logoutInitiated();
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { analytics.logoutConfirmed({}); logout(); } },
    ]);
  };

  const handleDeleteAccount = () => {
    analytics.deleteAccountInitiated();
    Alert.alert(
      "Delete Account",
      "Your conversations and memories will be deleted immediately. Your account will be permanently removed after 30 days.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          try {
            analytics.deleteAccountConfirmed({ was_paying_user: plan === "pro" });
            await userApi.deleteAccount(); logout();
          }
          catch (e: any) { Alert.alert("Error", e.error || "Failed"); }
        }},
      ]
    );
  };

  const handleResetChat = () => {
    analytics.resetKavyaInitiated();
    Alert.alert(
      "Reset Kavya",
      "Kavya will forget all your conversations and memories. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: async () => {
          try {
            analytics.resetKavyaConfirmed({});
            Alert.alert("Done", "Kavya has been reset. Start a fresh conversation!");
            onBack();
          } catch (e: any) { Alert.alert("Error", e.error || "Failed"); }
        }},
      ]
    );
  };

  const openLink = (type: string) => {
    analytics.linkClicked({ link_type: type as any });
    const urls: Record<string, string> = {
      privacy: "https://konvoo.live/privacy",
      terms: "https://konvoo.live/terms",
      support: "https://konvoo.live/support",
    };
    if (urls[type]) Linking.openURL(urls[type]);
  };

  const getPlanText = () => {
    if (plan === "pro") return isTrial ? "trial" : "pro ✓";
    return `free (${usage?.messagesSent || 0}/${limits?.messageLimit || 6} messages)`;
  };

  // ─── SETTINGS SCREEN ───
  if (showSettings) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Header */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={() => setShowSettings(false)} style={s.backBtn}>
              <Text style={s.backText}>←</Text>
            </TouchableOpacity>
            <Text style={s.settingsTitle}>settings</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Plan */}
          <TouchableOpacity style={s.settingsCard} onPress={() => { analytics.planCardTapped({ current_plan: plan }); onPaywall(); }}>
            <Text style={s.settingsLabel}>your plan</Text>
            <View style={s.planBadge}>
              <Text style={s.planBadgeText}>{getPlanText()}</Text>
            </View>
          </TouchableOpacity>

          {/* App Settings */}
          <Text style={s.sectionLabel}>app settings</Text>
          <View style={s.settingsGroup}>
            <View style={[s.settingsRow, s.settingsRowBorder]}>
              <Text style={s.settingsRowLabel}>language</Text>
              <Text style={s.settingsRowValue}>{user?.language || "hinglish"}</Text>
            </View>
            <View style={s.settingsRow}>
              <Text style={s.settingsRowLabel}>sound</Text>
              <Switch
                value={soundEnabled}
                onValueChange={(v) => { analytics.soundToggleChanged({ sound_enabled: v }); setSoundEnabled(v); }}
                trackColor={{ true: COLORS.saffron, false: COLORS.border }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Support */}
          <TouchableOpacity style={s.settingsCard} onPress={() => openLink("support")}>
            <Text style={s.settingsLabel}>get support</Text>
            <Text style={s.linkIcon}>↗</Text>
          </TouchableOpacity>

          {/* Data Protection */}
          <Text style={s.sectionLabel}>data protection</Text>
          <TouchableOpacity style={[s.settingsCard, { marginBottom: 8 }]} onPress={() => openLink("privacy")}>
            <Text style={s.settingsLabel}>privacy policy</Text>
            <Text style={s.linkIcon}>🔒</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.settingsCard, { marginBottom: 28 }]} onPress={() => openLink("terms")}>
            <Text style={s.settingsLabel}>terms and conditions</Text>
            <Text style={s.linkIcon}>📄</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity style={s.actionCard} onPress={handleLogout}>
            <Text style={s.actionLabel}>logout</Text>
          </TouchableOpacity>
          <Text style={s.actionDesc}>sign out of your account on this device</Text>

          {/* Reset */}
          <TouchableOpacity style={s.dangerCard} onPress={handleResetChat}>
            <Text style={s.dangerLabel}>reset kavya</Text>
          </TouchableOpacity>
          <Text style={s.dangerDesc}>kavya will forget all your conversations and memories</Text>

          {/* Delete */}
          <TouchableOpacity style={s.dangerCard} onPress={handleDeleteAccount}>
            <Text style={s.dangerLabel}>delete account</Text>
          </TouchableOpacity>
          <Text style={s.dangerDesc}>permanently delete your account and all data</Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── PROFILE SCREEN (Kavya-focused) ───
  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => { analytics.settingsScreenViewed(); setShowSettings(true); }} style={s.gearBtn}>
            <Text style={s.gearText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <TouchableOpacity
          style={s.avatarContainer}
          onPress={() => { if (charAvatar) { analytics.characterAvatarTapped({ character_name: "Kavya" }); setShowPhotoViewer(true); } }}
          activeOpacity={0.8}
        >
          {charAvatar ? (
            <Image source={{ uri: charAvatar }} style={s.avatarImg} />
          ) : (
            <View style={s.avatarPlaceholder}>
              <Text style={s.avatarEmoji}>🌸</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Name */}
        <Text style={s.charName}>kavya</Text>
        <Text style={s.onlineStatus}>● online</Text>

        {/* Nickname */}
        <View style={s.nicknameSection}>
          <Text style={s.sectionLabel}>nickname</Text>
          <View style={s.nicknameInput}>
            <TextInput
              style={s.nicknameText}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Kavya"
              placeholderTextColor={COLORS.muted}
            />
            <Text style={s.editIcon}>✏️</Text>
          </View>
          <Text style={s.nicknameHint}>give kavya a name only you can call her</Text>
        </View>

        {/* About */}
        <View style={s.aboutSection}>
          <Text style={s.sectionLabel}>about kavya</Text>
          <View style={s.aboutCard}>
            <Text style={s.aboutText}>24 · Content Creator · Mumbai</Text>
            <Text style={s.aboutText}>Chai lover ☕ · Dog mom 🐕 · Night owl 🌙</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Photo Viewer Modal */}
      <Modal visible={showPhotoViewer} transparent animationType="fade" onRequestClose={() => setShowPhotoViewer(false)}>
        <TouchableOpacity
          style={s.photoViewerOverlay}
          activeOpacity={1}
          onPress={() => setShowPhotoViewer(false)}
        >
          {charAvatar ? (
            <Image source={{ uri: charAvatar }} style={s.photoViewerImg} resizeMode="contain" />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingHorizontal: 16 },

  // Top bar
  topBar: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 22, color: COLORS.deep },
  gearBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  gearText: { fontSize: 22 },

  // Avatar
  avatarContainer: {
    width: 180, height: 180, borderRadius: 90, alignSelf: "center",
    marginTop: 12, overflow: "hidden",
    borderWidth: 4, borderColor: "rgba(232,101,43,0.15)",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%", height: "100%",
    backgroundColor: COLORS.saffronLight,
    alignItems: "center", justifyContent: "center",
  },
  avatarEmoji: { fontSize: 64 },

  // Name
  charName: { fontSize: 28, fontWeight: "800", color: COLORS.deep, textAlign: "center", marginTop: 16 },
  onlineStatus: { fontSize: 13, color: COLORS.muted, textAlign: "center", marginTop: 4 },

  // Nickname
  nicknameSection: { marginTop: 24 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: COLORS.muted, marginBottom: 8 },
  nicknameInput: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: "row", alignItems: "center",
  },
  nicknameText: { flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.deep },
  editIcon: { fontSize: 16 },
  nicknameHint: { fontSize: 12, color: COLORS.muted, textAlign: "center", marginTop: 8 },

  // About
  aboutSection: { marginTop: 24 },
  aboutCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16,
  },
  aboutText: { fontSize: 14, color: COLORS.deep, lineHeight: 22 },

  // Settings screen
  settingsTitle: { fontSize: 22, fontWeight: "800", color: COLORS.deep },
  settingsCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    marginBottom: 20,
  },
  settingsLabel: { fontSize: 15, fontWeight: "600", color: COLORS.deep },
  linkIcon: { fontSize: 16, color: COLORS.muted },
  planBadge: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, backgroundColor: COLORS.saffron,
  },
  planBadgeText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  settingsGroup: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 20,
  },
  settingsRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 16,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingsRowLabel: { fontSize: 15, fontWeight: "600", color: COLORS.deep },
  settingsRowValue: { fontSize: 13, fontWeight: "600", color: COLORS.muted },

  // Action cards
  actionCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 16, alignItems: "center", marginBottom: 4,
  },
  actionLabel: { fontSize: 15, fontWeight: "600", color: COLORS.deep },
  actionDesc: { fontSize: 12, color: COLORS.muted, textAlign: "center", marginBottom: 16 },

  // Danger cards
  dangerCard: {
    backgroundColor: COLORS.card, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(239,68,68,0.15)",
    padding: 16, alignItems: "center", marginBottom: 4,
  },
  dangerLabel: { fontSize: 15, fontWeight: "600", color: "#EF4444" },
  dangerDesc: { fontSize: 12, color: "#EF4444", textAlign: "center", marginBottom: 16 },

  // Photo viewer
  photoViewerOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  photoViewerImg: { width: "90%", height: "80%" },
});
