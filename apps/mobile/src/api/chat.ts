import { api } from "./client";
import type { MemoryResponse, SuggestionsResponse, ReportReason } from "@yaari/shared";

// ─── TYPES ─────────────────────────────────────────────

export interface Conversation {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  characterCategory: string;
  lastMessage: string | null;
  lastAt: string | null;
  messageCount: number;
  isArchived: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  contentType: "text" | "image" | "voice";
  imageUrl?: string;
  voiceUrl?: string;
  createdAt: string;
}

export interface SendMessageResponse {
  message: Message;
  imageGeneration?: {
    status: "queued" | "limit_reached";
    prompt?: string;
    jobId?: string;
    used?: number;
    limit?: number;
  };
}

// ─── API CALLS ─────────────────────────────────────────

export const chatApi = {
  /** List all conversations */
  listConversations: () =>
    api.get<{ conversations: Conversation[] }>("/conversations"),

  /** Start a new conversation with a character */
  startConversation: (characterId: string) =>
    api.post<{ conversationId: string; characterId: string; characterName: string; isNew: boolean }>(
      "/conversations",
      { characterId }
    ),

  /** Get messages for a conversation (paginated) */
  getMessages: (conversationId: string, params?: { cursor?: string; limit?: number }) =>
    api.get<{ messages: Message[]; hasMore: boolean; cursor: string | null }>(
      `/conversations/${conversationId}/messages`,
      { params }
    ),

  /** Send a message (HTTP fallback — prefer WebSocket) */
  sendMessage: (conversationId: string, content: string, type: "text" | "voice" = "text") =>
    api.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages`,
      { content, type }
    ),

  /** Reset conversation (delete all messages + memory) */
  resetConversation: (conversationId: string) =>
    api.post(`/conversations/${conversationId}/reset`),

  /** Delete conversation entirely */
  deleteConversation: (conversationId: string) =>
    api.delete(`/conversations/${conversationId}`),

  /** Send a voice message (audio base64 → transcribe → AI reply with voice) */
  sendVoiceMessage: (conversationId: string, audioBase64: string, format: string = "m4a") =>
    api.post<{
      userMessage: Message;
      message: Message;
    }>(`/conversations/${conversationId}/voice`, { audio: audioBase64, format }),

  /** Convert an existing text message to voice (TTS on demand) */
  getVoiceForMessage: (conversationId: string, messageId: string) =>
    api.post<{ voiceUrl: string }>(`/conversations/${conversationId}/messages/${messageId}/voice`),

  // ─── MEMORY ────────────────────────────────────────

  /** Get conversation memory (summary + key facts) */
  getMemory: (conversationId: string) =>
    api.get<MemoryResponse>(`/conversations/${conversationId}/memory`),

  /** Delete a specific memory fact by index */
  deleteMemoryItem: (conversationId: string, factIndex: number) =>
    api.delete<{ success: boolean; remainingCount: number }>(
      `/conversations/${conversationId}/memory/${factIndex}`
    ),

  /** Clear all memory for a conversation */
  clearMemory: (conversationId: string) =>
    api.delete<{ success: boolean }>(`/conversations/${conversationId}/memory`),

  // ─── REPORT ────────────────────────────────────────

  /** Report a conversation */
  reportConversation: (conversationId: string, reason: ReportReason, details?: string) =>
    api.post<{ success: boolean; message: string }>(
      `/conversations/${conversationId}/report`,
      { reason, details }
    ),

  // ─── SUGGESTIONS ──────────────────────────────────

  /** Get AI-generated reply suggestions */
  getSuggestions: (conversationId: string) =>
    api.post<SuggestionsResponse>(`/conversations/${conversationId}/suggestions`),
};
