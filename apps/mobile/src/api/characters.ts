import { api } from "./client";

// ─── TYPES ─────────────────────────────────────────────

export interface Character {
  id: string;
  name: string;
  avatarUrl: string;
  category: string;
  personality: {
    traits: string[];
    tone: string;
    quirks: string[];
    speakingStyle: string;
  };
  backstory: string;
  scenarioIntro?: string;
  isPremium: boolean;
  isFavorite: boolean;
}

export interface CharacterListResponse {
  characters: Character[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CharacterDetailResponse extends Character {
  conversationId: string | null;
}

// ─── API CALLS ─────────────────────────────────────────

export const charactersApi = {
  /** Get default character (Kavya) */
  getDefault: () =>
    api.get<Character>("/characters/default"),

  /** List characters with optional filters */
  list: (params?: { category?: string; search?: string; page?: number; limit?: number }) =>
    api.get<CharacterListResponse>("/characters", { params }),

  /** Get character detail */
  getById: (id: string) =>
    api.get<CharacterDetailResponse>(`/characters/${id}`),

  /** List categories */
  getCategories: () =>
    api.get<{ categories: string[] }>("/characters/categories"),

  /** Toggle favorite */
  toggleFavorite: (id: string) =>
    api.post<{ isFavorite: boolean }>(`/characters/${id}/favorite`),
};
