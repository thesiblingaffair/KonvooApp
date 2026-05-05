import { api } from "./client";

// ─── TYPES ─────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  name: string | null;
  language: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: User;
  isNewUser: boolean;
}

export interface OtpResponse {
  success: boolean;
  message: string;
  expiresIn: number;
}

// ─── API CALLS ─────────────────────────────────────────

export const authApi = {
  /** Send OTP via MSG91 */
  sendOtp: (phone: string) =>
    api.post<OtpResponse>("/auth/otp/send", { phone }, { skipAuth: true }),

  /** Verify OTP and get JWT tokens */
  verifyOtp: (phone: string, otp: string) =>
    api.post<AuthResponse>("/auth/otp/verify", { phone, otp }, { skipAuth: true }),

  /** Complete onboarding — set name + language */
  completeOnboarding: (name: string, language: string) =>
    api.post<{ success: boolean; user: User }>("/auth/onboarding", { name, language }),

  /** Get current user profile */
  getMe: () => api.get<User>("/auth/me"),

  /** Refresh tokens */
  refreshToken: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>(
      "/auth/refresh",
      { refreshToken },
      { skipAuth: true }
    ),

  /** Logout */
  logout: () => api.post("/auth/logout"),

  /** Verify Truecaller profile and get JWT tokens */
  verifyTruecaller: (payload: { phone: string; firstName: string; lastName: string; accessToken: string }) =>
    api.post<AuthResponse>("/auth/truecaller/verify", payload, { skipAuth: true }),
};
