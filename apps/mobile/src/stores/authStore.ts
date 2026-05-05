import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authApi, type User } from "../api";
import { logoutOneSignal } from "../utils/onesignal";

interface AuthState {
  // State
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;

  // Auth flow
  sendOtp: (phone: string) => Promise<{ success: boolean; expiresIn?: number }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ isNewUser: boolean }>;
  verifyTruecaller: (payload: { phone: string; firstName: string; lastName: string; accessToken: string }) => Promise<{ isNewUser: boolean }>;
  completeOnboarding: (name: string, language: string) => Promise<void>;
  fetchProfile: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // ─── Initial State ───────────────────────────
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isOnboarded: false,
      isLoading: false,
      error: null,

      // ─── Token Management ────────────────────────
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken, isAuthenticated: true }),

      setUser: (user) =>
        set({
          user,
          isOnboarded: !!(user.name && user.language),
        }),

      // ─── Send OTP ────────────────────────────────
      sendOtp: async (phone) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.sendOtp(phone);
          set({ isLoading: false });
          return { success: true, expiresIn: res.expiresIn };
        } catch (err: any) {
          const msg =
            err.code === "OTP_RATE_LIMITED"
              ? "Too many attempts. Wait 10 minutes."
              : err.error || "Failed to send OTP";
          set({ isLoading: false, error: msg });
          return { success: false };
        }
      },

      // ─── Verify OTP ──────────────────────────────
      verifyOtp: async (phone, otp) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.verifyOtp(phone, otp);
          set({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            user: res.user,
            isAuthenticated: true,
            isOnboarded: !res.isNewUser && !!res.user.name,
            isLoading: false,
          });
          return { isNewUser: res.isNewUser };
        } catch (err: any) {
          const msg =
            err.code === "OTP_INVALID"
              ? "Invalid or expired OTP"
              : err.error || "Verification failed";
          set({ isLoading: false, error: msg });
          throw new Error(msg);
        }
      },

      // ─── Verify Truecaller ────────────────────────
      verifyTruecaller: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.verifyTruecaller(payload);
          set({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            user: res.user,
            isAuthenticated: true,
            isOnboarded: !res.isNewUser && !!res.user.name,
            isLoading: false,
          });
          return { isNewUser: res.isNewUser };
        } catch (err: any) {
          set({ isLoading: false, error: err.error || "Truecaller verification failed" });
          throw new Error(err.error || "Truecaller verification failed");
        }
      },

      // ─── Complete Onboarding ─────────────────────
      completeOnboarding: async (name, language) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.completeOnboarding(name, language);
          set({
            user: res.user,
            isOnboarded: true,
            isLoading: false,
          });
        } catch (err: any) {
          set({ isLoading: false, error: err.error || "Onboarding failed" });
          throw err;
        }
      },

      // ─── Fetch Profile ───────────────────────────
      fetchProfile: async () => {
        try {
          const user = await authApi.getMe();
          set({
            user,
            isOnboarded: !!(user.name && user.language),
          });
        } catch {
          // Silent fail — will retry on next app open
        }
      },

      // ─── Logout ──────────────────────────────────
      logout: () => {
        authApi.logout().catch(() => {}); // best effort
        logoutOneSignal(); // Clear OneSignal identity
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          isOnboarded: false,
          error: null,
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "yaari-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isOnboarded: state.isOnboarded,
      }),
    }
  )
);
