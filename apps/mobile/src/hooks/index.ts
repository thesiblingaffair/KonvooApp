import { useState, useEffect, useCallback } from "react";
import { charactersApi, type Character } from "../api";
import { useChatStore } from "../stores/chatStore";
import { useAuthStore } from "../stores/authStore";
import { useSubscriptionStore } from "../stores/subscriptionStore";

// ─── useCharacters ─────────────────────────────────────

export function useCharacters(params?: {
  category?: string;
  search?: string;
}) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchCharacters = useCallback(
    async (pageNum = 1, append = false) => {
      setIsLoading(true);
      try {
        const res = await charactersApi.list({
          category: params?.category,
          search: params?.search,
          page: pageNum,
          limit: 20,
        });
        setCharacters((prev) =>
          append ? [...prev, ...res.characters] : res.characters
        );
        setHasMore(pageNum < res.pagination.totalPages);
        setPage(pageNum);
      } catch (error) {
        console.error("Failed to fetch characters:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [params?.category, params?.search]
  );

  const fetchCategories = useCallback(async () => {
    try {
      const res = await charactersApi.getCategories();
      setCategories(["All", ...res.categories]);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  useEffect(() => {
    fetchCharacters(1);
    fetchCategories();
  }, [fetchCharacters, fetchCategories]);

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchCharacters(page + 1, true);
    }
  };

  const toggleFavorite = async (id: string) => {
    try {
      const res = await charactersApi.toggleFavorite(id);
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, isFavorite: res.isFavorite } : c
        )
      );
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
    }
  };

  return {
    characters,
    categories,
    isLoading,
    hasMore,
    loadMore,
    toggleFavorite,
    refresh: () => fetchCharacters(1),
  };
}

// ─── useConversation ───────────────────────────────────

export function useConversation(conversationId: string | null) {
  const {
    messages,
    isLoadingMessages,
    isSending,
    isStreaming,
    streamingContent,
    hasMoreMessages,
    imageGenerating,
    limitReached,
    error,
    joinConversation,
    sendMessage,
    loadMessages,
    requestImage,
    clearLimitReached,
  } = useChatStore();

  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
    }
  }, [conversationId]);

  const loadMore = () => {
    if (conversationId && hasMoreMessages && !isLoadingMessages) {
      loadMessages(conversationId, true);
    }
  };

  return {
    messages,
    isLoading: isLoadingMessages,
    isSending,
    isStreaming,
    streamingContent,
    hasMore: hasMoreMessages,
    imageGenerating,
    limitReached,
    error,
    sendMessage,
    loadMore,
    requestImage,
    clearLimitReached,
  };
}

// ─── useSocket ─────────────────────────────────────────

export function useSocket() {
  const { connectSocket, disconnectSocket, isConnected } = useChatStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated]);

  return { isConnected };
}

// ─── useRazorpay ───────────────────────────────────────

export function useRazorpay() {
  const { subscribe, fetchStatus } = useSubscriptionStore();

  const openCheckout = async (plan: "buddy" | "bff") => {
    try {
      const data = await subscribe(plan);

      // React Native: use react-native-razorpay
      // import RazorpayCheckout from 'react-native-razorpay';
      // const result = await RazorpayCheckout.open(data.razorpayConfig);

      // Web fallback: use Razorpay JS SDK
      if (typeof window !== "undefined" && (window as any).Razorpay) {
        const rzp = new (window as any).Razorpay({
          ...data.razorpayConfig,
          handler: async (response: any) => {
            console.log("Payment success:", response);
            // Refresh subscription status after payment
            await fetchStatus();
          },
          modal: {
            ondismiss: () => console.log("Payment dismissed"),
          },
        });
        rzp.open();
      }

      return data;
    } catch (error) {
      console.error("Razorpay checkout failed:", error);
      throw error;
    }
  };

  return { openCheckout };
}

// ─── useAppInit ────────────────────────────────────────
// Call this once at app root to hydrate stores

export function useAppInit() {
  const { isAuthenticated, fetchProfile } = useAuthStore();
  const { fetchConversations } = useChatStore();
  const { fetchStatus } = useSubscriptionStore();
  const { isConnected } = useSocket();

  useEffect(() => {
    if (isAuthenticated) {
      // Hydrate all stores in parallel
      Promise.all([
        fetchProfile(),
        fetchConversations(),
        fetchStatus(),
      ]).catch(console.error);
    }
  }, [isAuthenticated]);

  return { isConnected };
}
