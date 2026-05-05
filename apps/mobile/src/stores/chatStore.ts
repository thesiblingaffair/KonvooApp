import { create } from "zustand";
import { chatApi, type Conversation, type Message } from "../api/chat";
import type { MemoryResponse, ReportReason } from "@yaari/shared";

interface ChatState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoadingConversations: boolean;

  // Messages
  messages: Message[];
  isLoadingMessages: boolean;
  isSending: boolean;
  streamingContent: string;

  // Limits
  limitReached: { type: "messages" | "images"; plan: string; used: number; limit: number } | null;

  // Memory
  memory: MemoryResponse | null;
  isLoadingMemory: boolean;

  // Suggestions
  suggestions: string[];
  isLoadingSuggestions: boolean;

  // Socket
  socket: any;
  error: string | null;

  // ─── Actions ─────────────────────────────────────

  // Conversations
  fetchConversations: () => Promise<void>;
  startConversation: (characterId: string) => Promise<string>;
  resetConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  // Messages
  fetchMessages: (conversationId: string, cursor?: string) => Promise<void>;
  sendMessage: (content: string, type?: "text" | "voice") => Promise<void>;
  setActiveConversation: (conversationId: string) => void;

  // Memory
  fetchMemory: (conversationId: string) => Promise<void>;
  deleteMemoryItem: (conversationId: string, factIndex: number) => Promise<void>;
  clearMemory: (conversationId: string) => Promise<void>;

  // Report
  reportConversation: (conversationId: string, reason: ReportReason, details?: string) => Promise<void>;

  // Suggestions
  fetchSuggestions: (conversationId: string) => Promise<void>;
  clearSuggestions: () => void;

  // WebSocket
  requestImage: (prompt: string) => void;
  connectSocket: (conversationId: string) => void;
  disconnectSocket: () => void;

  // Cleanup
  clearLimitReached: () => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isLoadingConversations: false,
  messages: [],
  isLoadingMessages: false,
  isSending: false,
  streamingContent: "",
  limitReached: null,
  memory: null,
  isLoadingMemory: false,
  suggestions: [],
  isLoadingSuggestions: false,
  socket: null,
  error: null,

  // ─── Conversations ───────────────────────────────

  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const data = await chatApi.listConversations();
      set({ conversations: data.conversations, isLoadingConversations: false });
    } catch (err: any) {
      set({ isLoadingConversations: false, error: err.error });
    }
  },

  startConversation: async (characterId) => {
    const data = await chatApi.startConversation(characterId);
    return data.conversationId;
  },

  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId, messages: [], streamingContent: "" });
  },

  // ─── Messages ────────────────────────────────────

  fetchMessages: async (conversationId, cursor) => {
    set({ isLoadingMessages: true });
    try {
      const data = await chatApi.getMessages(conversationId, { cursor });
      set((state) => ({
        messages: cursor ? [...data.messages, ...state.messages] : data.messages,
        isLoadingMessages: false,
        activeConversationId: conversationId,
      }));
    } catch (err: any) {
      set({ isLoadingMessages: false, error: err.error });
    }
  },

  sendMessage: async (content, type = "text") => {
    const { activeConversationId, socket } = get();
    if (!activeConversationId) return;

    set({ isSending: true, error: null });

    // Optimistic: add user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      contentType: type,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ messages: [...state.messages, userMsg] }));

    // Try WebSocket first
    if (socket?.connected) {
      socket.emit("message", { conversationId: activeConversationId, content, type });
      set({ isSending: false });
      return;
    }

    // HTTP fallback
    try {
      const data = await chatApi.sendMessage(activeConversationId, content, type);
      set((state) => ({
        messages: [...state.messages, data.message],
        isSending: false,
      }));
    } catch (err: any) {
      if (err.code === "MESSAGE_LIMIT_REACHED") {
        set({ limitReached: { type: "messages", plan: err.plan, used: err.used, limit: err.limit } });
      }
      set({ error: err.error, isSending: false });
    }
  },

  // ─── Memory ──────────────────────────────────────

  fetchMemory: async (conversationId) => {
    set({ isLoadingMemory: true });
    try {
      const data = await chatApi.getMemory(conversationId);
      set({ memory: data, isLoadingMemory: false });
    } catch (err: any) {
      set({ isLoadingMemory: false, error: err.error });
    }
  },

  deleteMemoryItem: async (conversationId, factIndex) => {
    try {
      await chatApi.deleteMemoryItem(conversationId, factIndex);
      // Re-fetch memory to get updated list
      const data = await chatApi.getMemory(conversationId);
      set({ memory: data });
    } catch (err: any) {
      set({ error: err.error });
    }
  },

  clearMemory: async (conversationId) => {
    try {
      await chatApi.clearMemory(conversationId);
      set({ memory: { summary: "", memories: [], emotionalState: "neutral", totalCount: 0 } });
    } catch (err: any) {
      set({ error: err.error });
    }
  },

  // ─── Report ──────────────────────────────────────

  reportConversation: async (conversationId, reason, details) => {
    await chatApi.reportConversation(conversationId, reason, details);
  },

  // ─── Suggestions ─────────────────────────────────

  fetchSuggestions: async (conversationId) => {
    set({ isLoadingSuggestions: true });
    try {
      const data = await chatApi.getSuggestions(conversationId);
      set({ suggestions: data.suggestions, isLoadingSuggestions: false });
    } catch (err: any) {
      set({ isLoadingSuggestions: false, suggestions: [] });
    }
  },

  clearSuggestions: () => set({ suggestions: [] }),

  // ─── Image ───────────────────────────────────────

  requestImage: (prompt) => {
    const { socket, activeConversationId } = get();
    if (!socket?.connected || !activeConversationId) return;
    socket.emit("generate_image", { conversationId: activeConversationId, prompt });
  },

  // ─── WebSocket ───────────────────────────────────

  connectSocket: (_conversationId) => {
    // Socket connection logic (unchanged from existing)
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  // ─── Conversation Management ─────────────────────

  resetConversation: async (conversationId) => {
    await chatApi.resetConversation(conversationId);
    if (get().activeConversationId === conversationId) {
      set({ messages: [], memory: null, suggestions: [] });
    }
    get().fetchConversations();
  },

  deleteConversation: async (conversationId) => {
    await chatApi.deleteConversation(conversationId);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
      activeConversationId:
        state.activeConversationId === conversationId ? null : state.activeConversationId,
      messages: state.activeConversationId === conversationId ? [] : state.messages,
      memory: state.activeConversationId === conversationId ? null : state.memory,
    }));
  },

  clearLimitReached: () => set({ limitReached: null }),
  clearChat: () => set({ activeConversationId: null, messages: [], streamingContent: "", suggestions: [], memory: null }),
}));
