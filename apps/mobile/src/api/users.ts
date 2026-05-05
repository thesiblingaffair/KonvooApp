import { api } from "./client";

export const userApi = {
  /** Get current user profile */
  getMe: () => api.get<{ user: any; stats: any }>("/users/me"),

  /** Update user profile */
  updateProfile: (data: { name?: string; language?: string }) =>
    api.patch("/users/me", data),

  /** Delete user account */
  deleteAccount: () => api.delete("/users/me"),
};
