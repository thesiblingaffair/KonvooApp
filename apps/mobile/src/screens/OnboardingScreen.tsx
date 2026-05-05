import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Dimensions, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import { useTruecaller } from "../hooks/useTruecaller";
import analytics from "../utils/analytics";
import { COLORS } from "../theme";

const { width } = Dimensions.get("window");

const LANGUAGES = [
  { code: "hinglish", native: "Hinglish", name: "Hindi + English" },
  { code: "hi", native: "हिन्दी", name: "Hindi" },
  { code: "en", native: "English", name: "English" },
  { code: "kn", native: "ಕನ್ನಡ", name: "Kannada" },
  { code: "te", native: "తెలుగు", name: "Telugu" },
  { code: "ta", native: "தமிழ்", name: "Tamil" },
  { code: "bn", native: "বাংলা", name: "Bengali" },
  { code: "ml", native: "മലയാളം", name: "Malayalam" },
  { code: "gu", native: "ગુજરાતી", name: "Gujarati" },
  { code: "mr", native: "मराठी", name: "Marathi" },
  { code: "pa", native: "ਪੰਜਾਬੀ", name: "Punjabi" },
  { code: "or", native: "ଓଡ଼ିଆ", name: "Odia" },
];

type Step = "welcome" | "phone" | "otp" | "name" | "language";

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>("welcome");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [name, setName] = useState("");
  const [selectedLang, setSelectedLang] = useState("hinglish");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [welcomeViewedAt] = useState(Date.now());
  const [otpSentAt, setOtpSentAt] = useState(0);
  const [onboardingStartedAt] = useState(Date.now());

  const otpRefs = useRef<(TextInput | null)[]>([]);
  const tcTriggered = useRef(false);
  const { sendOtp, verifyOtp, verifyTruecaller, completeOnboarding } = useAuthStore();
  const { isAvailable: tcAvailable, isLoading: tcLoading, profile: tcProfile, error: tcError, requestVerification } = useTruecaller();

  // Auto-trigger Truecaller popup when user lands on phone screen
  useEffect(() => {
    if (step === "phone" && tcAvailable && !tcTriggered.current) {
      tcTriggered.current = true;
      analytics.track("truecaller_auto_triggered", { is_available: true });
      // Small delay to let the screen render first
      setTimeout(() => requestVerification(), 500);
    }
  }, [step, tcAvailable]);

  // Handle Truecaller profile received
  useEffect(() => {
    if (!tcProfile) return;
    const doVerify = async () => {
      setLoading(true);
      try {
        const phone = tcProfile.phoneNumber.startsWith("+") ? tcProfile.phoneNumber : "+91" + tcProfile.phoneNumber;
        analytics.track("truecaller_success", {
          phone_last4: phone.slice(-4),
          has_name: !!tcProfile.firstName,
          source: tcTriggered.current ? "auto_popup" : "manual_tap",
        });
        const result = await verifyTruecaller({
          phone,
          firstName: tcProfile.firstName,
          lastName: tcProfile.lastName,
          accessToken: tcProfile.accessToken,
        });
        if (result.isNewUser) {
          setName(tcProfile.firstName || "");
          setStep("name");
          analytics.nameScreenViewed();
        }
      } catch (e: any) {
        setError(e.message || "Truecaller login failed. Try OTP instead.");
        analytics.track("truecaller_verify_failed", { error: e.message || "unknown" });
      }
      setLoading(false);
    };
    doVerify();
  }, [tcProfile]);

  // Handle Truecaller error/dismiss
  useEffect(() => {
    if (!tcError) return;
    analytics.track("truecaller_dismissed", {
      error: tcError,
      source: tcTriggered.current ? "auto_popup" : "manual_tap",
    });
  }, [tcError]);

  // Resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleSendOtp = async () => {
    if (phone.length !== 10) return;
    setLoading(true);
    setError("");
    const isResend = step === "otp";
    if (isResend) setResendCount(resendCount + 1);
    analytics.otpRequested({ phone_number: phone.slice(-4), is_resend: isResend, resend_count: resendCount });
    try {
      await sendOtp("+91" + phone);
      setStep("otp");
      setResendTimer(30);
      setOtpSentAt(Date.now());
      analytics.otpScreenViewed({ phone_number: phone.slice(-4) });
    } catch (e: any) {
      setError(e.error || "Failed to send OTP");
      analytics.otpRequestFailed({ phone_number: phone.slice(-4), error_code: e.code || "UNKNOWN", error_message: e.error || "" });
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    setOtpAttempts(otpAttempts + 1);
    try {
      const result = await verifyOtp("+91" + phone, code);
      analytics.otpVerified({
        phone_number: phone.slice(-4),
        is_new_user: result.isNewUser,
        verification_time_ms: Date.now() - otpSentAt,
      });
      if (result.isNewUser) {
        setStep("name");
        analytics.nameScreenViewed();
      }
    } catch (e: any) {
      setError(e.error || "Invalid OTP");
      analytics.otpVerificationFailed({ phone_number: phone.slice(-4), error_code: e.code || "OTP_INVALID", attempt_number: otpAttempts });
    }
    setLoading(false);
  };

  const handleOtpChange = (text: string, index: number) => {
    // Handle paste (full OTP pasted into one field)
    if (text.length > 1) {
      const digits = text.replace(/\D/g, "").slice(0, 6).split("");
      const newOtp = [...otp];
      digits.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
      setOtp(newOtp);
      if (digits.length >= 6) {
        setTimeout(() => handleVerifyOtp(), 100);
      } else {
        otpRefs.current[digits.length]?.focus();
      }
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    // Auto-verify when all 6 filled
    if (text && index === 5) {
      const full = newOtp.join("");
      if (full.length === 6) setTimeout(() => handleVerifyOtp(), 100);
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleCompleteName = () => {
    if (!name.trim()) return;
    analytics.nameSubmitted({ name_length: name.trim().length });
    setStep("language");
    analytics.languageScreenViewed();
  };

  const handleFinish = async () => {
    setLoading(true);
    analytics.languageSelected({ language_code: selectedLang, language_name: LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang });
    try {
      await completeOnboarding(name.trim(), selectedLang);
      analytics.onboardingCompleted({ user_name: name.trim(), language: selectedLang, total_onboarding_time_ms: Date.now() - onboardingStartedAt });
    } catch (e: any) {
      Alert.alert("Error", e.error || "Failed to complete setup");
      analytics.onboardingFailed({ error_message: e.error || "Failed" });
    }
    setLoading(false);
  };

  // ─── WELCOME ───
  if (step === "welcome") {
    return (
      <SafeAreaView style={[s.container, s.welcomeBg]}>
        <View style={s.welcomeContent}>
          <Text style={s.welcomeEmoji}>🫂</Text>
          <Text style={s.welcomeTitle}>Your AI bestie,{"\n"}always here</Text>
          <Text style={s.welcomeSub}>
            Meet Kavya — your AI best friend who actually gets you
          </Text>
        </View>
        <View style={s.welcomeFooter}>
          <TouchableOpacity style={s.btnPrimary} onPress={() => {
            analytics.welcomeCtaClicked({ time_on_screen_ms: Date.now() - welcomeViewedAt });
            setStep("phone");
            analytics.phoneScreenViewed();
          }}>
            <Text style={s.btnPrimaryText}>Let's go!</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── PHONE ───
  if (step === "phone") {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={s.authContainer} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Text style={s.authTitle}>Login or Sign up</Text>
          <Text style={s.authSub}>Quick and easy — pick your preferred way</Text>
          {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

          {/* Truecaller one-tap (shown only if installed) */}
          {tcAvailable && (
            <>
              <TouchableOpacity
                style={s.truecallerBtn}
                onPress={() => {
                  analytics.track("truecaller_btn_clicked", { source: "manual_tap" });
                  requestVerification();
                }}
                disabled={tcLoading || loading}
              >
                {tcLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={s.truecallerIcon}>📞</Text>
                    <Text style={s.truecallerBtnText}>Continue with Truecaller</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>
            </>
          )}

          {/* OTP flow */}
          <Text style={[s.authSub, { marginBottom: 12 }]}>Enter phone number for OTP</Text>
          <View style={s.phoneRow}>
            <View style={s.countryCode}>
              <Text style={s.countryCodeText}>🇮🇳 +91</Text>
            </View>
            <TextInput
              style={s.phoneInput}
              placeholder="98765 43210"
              placeholderTextColor={COLORS.subtle}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus={!tcAvailable}
            />
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[s.btnPrimary, (!phone || phone.length !== 10 || loading) && s.btnDisabled]}
            onPress={handleSendOtp}
            disabled={phone.length !== 10 || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPrimaryText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── OTP ───
  if (step === "otp") {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={s.authContainer} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Text style={s.authTitle}>Verify OTP</Text>
          <Text style={s.authSub}>Sent to +91 {phone}</Text>
          {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
          <View style={s.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { otpRefs.current[i] = ref; }}
                style={[s.otpBox, digit ? s.otpBoxFilled : null]}
                value={digit}
                onChangeText={(t) => handleOtpChange(t, i)}
                onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={i === 0 ? 6 : 1}
                autoFocus={i === 0}
                textContentType={i === 0 ? "oneTimeCode" : "none"}
              />
            ))}
          </View>
          {resendTimer > 0 ? (
            <Text style={s.resendTimer}>Resend OTP in {resendTimer}s</Text>
          ) : (
            <TouchableOpacity onPress={() => {
              analytics.otpResendClicked({ phone_number: phone.slice(-4), resend_count: resendCount + 1 });
              handleSendOtp();
            }}>
              <Text style={s.resendBtn}>Resend OTP</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[s.btnPrimary, (otp.join("").length !== 6 || loading) && s.btnDisabled]}
            onPress={handleVerifyOtp}
            disabled={otp.join("").length !== 6 || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPrimaryText}>Verify</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── NAME ───
  if (step === "name") {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={s.nameContainer} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>👋</Text>
          <Text style={s.authTitle}>What should we call you?</Text>
          <Text style={[s.authSub, { marginBottom: 24 }]}>Kavya needs to know your name!</Text>
          <TextInput
            style={s.nameInput}
            placeholder="Enter your name"
            placeholderTextColor={COLORS.subtle}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={handleCompleteName}
          />
          <View style={{ height: 20 }} />
          <TouchableOpacity
            style={[s.btnPrimary, { maxWidth: 280, alignSelf: "center" }, !name.trim() && s.btnDisabled]}
            onPress={handleCompleteName}
            disabled={!name.trim()}
          >
            <Text style={s.btnPrimaryText}>Continue</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── LANGUAGE ───
  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.langContainer}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🌐</Text>
        <Text style={s.authTitle}>Choose your language</Text>
        <Text style={[s.authSub, { marginBottom: 24 }]}>How should Kavya talk to you?</Text>
        <View style={s.langGrid}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[s.langCard, selectedLang === lang.code && s.langCardSelected]}
              onPress={() => setSelectedLang(lang.code)}
            >
              <Text style={[s.langNative, selectedLang === lang.code && s.langNativeSelected]}>
                {lang.native}
              </Text>
              <Text style={[s.langName, selectedLang === lang.code && s.langNameSelected]}>
                {lang.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 20 }} />
        <TouchableOpacity
          style={[s.btnPrimary, { maxWidth: 320, alignSelf: "center" }, loading && s.btnDisabled]}
          onPress={handleFinish}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.btnPrimaryText}>Continue</Text>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  
  // Welcome
  welcomeBg: { backgroundColor: COLORS.saffronLight },
  welcomeContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  welcomeEmoji: { fontSize: 72, marginBottom: 24 },
  welcomeTitle: { fontSize: 28, fontWeight: "800", color: COLORS.deep, lineHeight: 34, textAlign: "center", marginBottom: 12 },
  welcomeSub: { fontSize: 15, color: COLORS.muted, lineHeight: 22, textAlign: "center" },
  welcomeFooter: { paddingHorizontal: 24, paddingBottom: 32 },

  // Auth shared
  authContainer: { flex: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 },
  authTitle: { fontSize: 26, fontWeight: "700", color: COLORS.deep, marginBottom: 8 },
  authSub: { fontSize: 14, color: COLORS.muted, marginBottom: 32 },
  errorBox: { backgroundColor: COLORS.rose, padding: 12, borderRadius: 10, marginBottom: 16 },
  errorText: { color: COLORS.roseText, fontSize: 13 },

  // Phone
  phoneRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  countryCode: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, justifyContent: "center" },
  countryCodeText: { fontSize: 15, fontWeight: "600", color: COLORS.deep },
  phoneInput: { flex: 1, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, fontSize: 16, fontWeight: "600", color: COLORS.deep },

  // OTP
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  otpBox: { width: 44, height: 52, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.card, textAlign: "center", fontSize: 22, fontWeight: "700", color: COLORS.deep },
  otpBoxFilled: { borderColor: COLORS.saffron },
  resendTimer: { textAlign: "center", fontSize: 13, color: COLORS.muted, marginBottom: 16 },
  resendBtn: { textAlign: "center", fontSize: 14, color: COLORS.saffron, fontWeight: "600" },

  // Name
  nameContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  nameInput: { width: "100%", maxWidth: 280, paddingHorizontal: 18, paddingVertical: 14, borderWidth: 2, borderColor: COLORS.border, borderRadius: 16, fontSize: 16, color: COLORS.deep, backgroundColor: COLORS.card, textAlign: "center" },

  // Language
  langContainer: { alignItems: "center", paddingHorizontal: 24, paddingTop: 40 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, width: "100%", maxWidth: 320 },
  langCard: { width: (320 - 20) / 3, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.card, alignItems: "center" },
  langCardSelected: { borderColor: COLORS.saffron, backgroundColor: COLORS.saffronLight },
  langNative: { fontSize: 18, fontWeight: "700", color: COLORS.deep, marginBottom: 2 },
  langNativeSelected: { color: COLORS.saffron },
  langName: { fontSize: 10, color: COLORS.muted },
  langNameSelected: { color: COLORS.saffron },

  // Buttons
  btnPrimary: { width: "100%", paddingVertical: 16, backgroundColor: COLORS.saffron, borderRadius: 16, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  btnDisabled: { backgroundColor: COLORS.border },

  // Truecaller
  truecallerBtn: { width: "100%", paddingVertical: 16, backgroundColor: "#0066FF", borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 },
  truecallerIcon: { fontSize: 20 },
  truecallerBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Divider
  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 13, color: COLORS.muted, fontWeight: "500" },
});
