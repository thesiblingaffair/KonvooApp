import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, ScrollView, Alert, Animated, Vibration,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChatStore } from "../stores/chatStore";
import { useVoiceRecorder, useVoicePlayer, formatDuration } from "../hooks/useVoice";
import { VoiceNoteBubble } from "../components/VoiceNoteBubble";
import { chatApi } from "../api/chat";
import analytics from "../utils/analytics";
import { COLORS } from "../theme";

interface Props {
  conversationId: string;
  characterName: string;
  characterAvatar: string;
  onBack: () => void;
  onPaywall: () => void;
}

export function ChatScreen({ conversationId, characterName, characterAvatar, onBack, onPaywall }: Props) {
  const {
    messages, isSending, limitReached, suggestions, isLoadingSuggestions,
    fetchMessages, sendMessage, setActiveConversation,
    clearLimitReached, fetchSuggestions, clearSuggestions,
    resetConversation, deleteConversation, fetchMemory,
    memory, reportConversation,
  } = useChatStore();

  const [inputText, setInputText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  // Voice recording & playback
  const { isRecording, recordingDuration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder();
  const { playingId, playbackProgress, playbackDuration, play: playVoice } = useVoicePlayer();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    setActiveConversation(conversationId);
    fetchMessages(conversationId);
    analytics.chatScreenViewed({ character_name: characterName, conversation_id: conversationId });
  }, [conversationId]);

  // Auto-show suggestions on first load
  useEffect(() => {
    if (messages.length === 0 && conversationId) {
      setShowSuggestions(true);
      fetchSuggestions(conversationId);
    }
  }, [messages.length, conversationId]);

  useEffect(() => {
    if (limitReached) {
      analytics.messageLimitReached({ messages_sent: messages.length, message_limit: 6, character_name: characterName });
      onPaywall();
      clearLimitReached();
    }
  }, [limitReached]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    setInputText("");
    setShowSuggestions(false);
    analytics.messageSent({ conversation_id: conversationId, character_name: characterName, message_length: text.length, message_source: "typed" });
    sendMessage(text);
  };

  // ─── VOICE MESSAGE ───
  const handleVoiceSend = async () => {
    const result = await stopRecording();
    if (!result || result.duration < 1) return; // Ignore very short recordings

    setIsSendingVoice(true);
    Vibration.vibrate(50); // Haptic feedback

    try {
      const response = await chatApi.sendVoiceMessage(conversationId, result.base64, result.format);

      // Add both user message and AI reply to the store
      useChatStore.setState((state) => ({
        messages: [
          ...state.messages,
          ...(response.userMessage ? [response.userMessage] : []),
          ...(response.message ? [response.message] : []),
        ],
      }));

      flatListRef.current?.scrollToEnd({ animated: true });
    } catch (error: any) {
      if (error?.response?.data?.code === "VOICE_PRO_ONLY") {
        Alert.alert("Pro Feature", "Voice notes are available for Pro users. Upgrade to hear Kavya's voice! 🎤");
      } else {
        Alert.alert("Error", "Couldn't send voice note. Try again?");
      }
    } finally {
      setIsSendingVoice(false);
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      handleVoiceSend();
    } else {
      const started = await startRecording();
      if (started) Vibration.vibrate(30);
    }
  };

  const handleSuggestionPress = (text: string, index: number) => {
    setInputText(text);
    setShowSuggestions(false);
    analytics.suggestionTapped({ suggestion_text: text, suggestion_index: index, conversation_id: conversationId });
    setTimeout(() => {
      analytics.messageSent({ conversation_id: conversationId, character_name: characterName, message_length: text.length, message_source: "suggestion" });
      sendMessage(text);
      setInputText("");
    }, 100);
  };

  const handleReset = () => {
    setShowMenu(false);
    analytics.chatResetInitiated({ conversation_id: conversationId, character_name: characterName });
    Alert.alert("Reset Chat", "This will delete all messages and memory. Continue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => {
        analytics.chatResetConfirmed({ conversation_id: conversationId, character_name: characterName, total_messages_before_reset: messages.length });
        resetConversation(conversationId);
      }},
    ]);
  };

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert("Delete Conversation", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        analytics.chatDeleted({ conversation_id: conversationId, character_name: characterName });
        await deleteConversation(conversationId);
        onBack();
      }},
    ]);
  };

  const handleReport = () => {
    setShowMenu(false);
    Alert.alert("Report Conversation", "Report this conversation for inappropriate content?", [
      { text: "Cancel", style: "cancel" },
      { text: "Report", onPress: () => {
        analytics.chatReported({ conversation_id: conversationId, character_name: characterName, reason: "inappropriate" });
        reportConversation(conversationId, "inappropriate" as any);
        Alert.alert("Reported", "Thanks for letting us know.");
      }},
    ]);
  };

  const handleViewMemory = () => {
    setShowMenu(false);
    fetchMemory(conversationId);
    setShowMemory(true);
  };

  const toggleSuggestions = () => {
    const newState = !showSuggestions;
    analytics.suggestionPanelToggled({ action: newState ? "opened" : "closed", conversation_id: conversationId });
    if (newState) fetchSuggestions(conversationId);
    setShowSuggestions(newState);
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isUser = item.role === "user";
    const isVoice = item.contentType === "voice" && item.voiceUrl;

    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAssistant]}>
        {!isUser && (
          <View style={s.msgAvatar}>
            {characterAvatar ? (
              <Image source={{ uri: characterAvatar }} style={s.msgAvatarImg} />
            ) : (
              <Text style={s.msgAvatarEmoji}>🧑🏽</Text>
            )}
          </View>
        )}
        <View style={isVoice ? { maxWidth: "80%" } : [s.msgBubble, isUser ? s.msgBubbleUser : s.msgBubbleAssistant]}>
          {!isUser && !isVoice && <Text style={s.msgCharName}>{characterName}</Text>}
          {isVoice ? (
            <VoiceNoteBubble
              messageId={item.id}
              voiceUrl={item.voiceUrl}
              duration={playingId === item.id ? playbackDuration : 0}
              isUser={isUser}
              isPlaying={playingId === item.id}
              progress={playingId === item.id ? playbackProgress : 0}
              onPlay={playVoice}
            />
          ) : (
            <>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.msgImage} resizeMode="cover" />
              ) : null}
              <Text style={[s.msgText, isUser ? s.msgTextUser : s.msgTextAssistant]}>
                {item.content}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* ─── HEADER ─── */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.headerAvatar}>
          {characterAvatar ? (
            <Image source={{ uri: characterAvatar }} style={s.headerAvatarImg} />
          ) : (
            <Text style={s.headerAvatarEmoji}>🧑🏽</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={onBack}>
          <Text style={s.headerName}>{characterName}</Text>
          <Text style={s.headerStatus}>{isSending ? "typing..." : ""}{!isSending && <><Text style={{ color: "#25D366" }}>●</Text> online</>}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { analytics.chatMenuOpened({ conversation_id: conversationId, character_name: characterName }); setShowMenu(true); }} style={s.kebabBtn}>
          <Text style={s.kebabText}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* ─── DISCLAIMER ─── */}
      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>🔒 Your conversations are private and secure</Text>
      </View>

      {/* ─── MESSAGES ─── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={s.msgList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatEmoji}>👋</Text>
              <Text style={s.emptyChatText}>Say hi to {characterName}!</Text>
            </View>
          }
        />

        {/* ─── TYPING INDICATOR ─── */}
        {isSending && (
          <View style={s.typingRow}>
            <View style={s.msgAvatar}>
              <Text style={s.msgAvatarEmoji}>🧑🏽</Text>
            </View>
            <View style={s.typingDots}>
              <View style={s.typingDot} />
              <View style={[s.typingDot, { opacity: 0.6 }]} />
              <View style={[s.typingDot, { opacity: 0.3 }]} />
            </View>
          </View>
        )}

        {/* ─── SUGGESTIONS PANEL ─── */}
        {showSuggestions && (
          <View style={s.suggestionsPanel}>
            {isLoadingSuggestions ? (
              <ActivityIndicator size="small" color={COLORS.saffron} style={{ padding: 10 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.suggestionsScroll}>
                {suggestions.map((sug, i) => (
                  <TouchableOpacity key={i} style={s.suggestionChip} onPress={() => handleSuggestionPress(sug, i)}>
                    <Text style={s.suggestionText}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ─── INPUT BAR ─── */}
        {isRecording ? (
          /* Recording state — red indicator + duration + stop/cancel */
          <View style={s.inputBar}>
            <View style={s.recordingIndicator}>
              <View style={s.recordingDot} />
              <Text style={s.recordingText}>{formatDuration(recordingDuration)}</Text>
            </View>
            <TouchableOpacity style={s.cancelRecordBtn} onPress={cancelRecording}>
              <Text style={s.cancelRecordText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sendBtn, s.sendBtnActive]} onPress={handleVoiceSend}>
              <Text style={s.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        ) : isSendingVoice ? (
          /* Sending voice state — loading */
          <View style={[s.inputBar, { justifyContent: "center" }]}>
            <ActivityIndicator size="small" color={COLORS.saffron} />
            <Text style={{ color: COLORS.subtle, fontSize: 13, marginLeft: 8 }}>Generating voice reply...</Text>
          </View>
        ) : (
          /* Normal input state */
          <View style={s.inputBar}>
            <TextInput
              style={s.textInput}
              placeholder="Message..."
              placeholderTextColor={COLORS.subtle}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline={false}
            />
            <TouchableOpacity style={s.hashBtn} onPress={toggleSuggestions}>
              <Text style={[s.hashBtnText, showSuggestions && { color: COLORS.saffron }]}>
                {showSuggestions ? "✕" : "#"}
              </Text>
            </TouchableOpacity>
            {inputText.trim() ? (
              <TouchableOpacity
                style={[s.sendBtn, s.sendBtnActive]}
                onPress={handleSend}
                disabled={isSending}
              >
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.micBtn} onPress={handleMicPress}>
                <Text style={s.micBtnText}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ─── KEBAB MENU MODAL ─── */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={s.menuSheet}>
            <View style={s.menuHandle} />
            <Text style={s.menuTitle}>Options</Text>

            <TouchableOpacity style={s.menuItem} onPress={handleViewMemory}>
              <View style={[s.menuIcon, { backgroundColor: COLORS.saffronLight }]}>
                <Text>🧠</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuLabel}>Memory</Text>
                <Text style={s.menuDesc}>What this character remembers</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.menuItem} onPress={handleReset}>
              <View style={[s.menuIcon, { backgroundColor: COLORS.saffronLight }]}>
                <Text>🔄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuLabel}>Reset Chat</Text>
                <Text style={s.menuDesc}>Clear messages & memory</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.menuItem} onPress={handleReport}>
              <View style={[s.menuIcon, { backgroundColor: COLORS.saffronLight }]}>
                <Text>🚩</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuLabel}>Report Conversation</Text>
                <Text style={s.menuDesc}>Something wrong? Let us know</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[s.menuItem, { borderBottomWidth: 0 }]} onPress={handleDelete}>
              <View style={[s.menuIcon, { backgroundColor: COLORS.rose }]}>
                <Text>🗑️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuLabel, { color: "#EF4444" }]}>Delete</Text>
                <Text style={s.menuDesc}>Remove conversation permanently</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.menuCancel} onPress={() => setShowMenu(false)}>
              <Text style={s.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── MEMORY MODAL ─── */}
      <Modal visible={showMemory} transparent animationType="slide" onRequestClose={() => setShowMemory(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowMemory(false)}>
          <View style={s.menuSheet}>
            <View style={s.menuHandle} />
            <Text style={s.menuTitle}>🧠 Memory</Text>
            <Text style={[s.menuDesc, { paddingHorizontal: 20, marginBottom: 16 }]}>
              What {characterName} remembers about you
            </Text>
            <ScrollView style={{ maxHeight: 300, paddingHorizontal: 20 }} onLayout={() => {
              analytics.memoryViewed({ conversation_id: conversationId, character_name: characterName, memory_count: memory?.memories?.length || 0 });
            }}>
              {memory?.memories && memory.memories.length > 0 ? (
                memory.memories.map((fact: any, i: number) => (
                  <View key={i} style={s.memoryItem}>
                    <Text style={s.memoryDot}>•</Text>
                    <Text style={s.memoryText}>{fact.content || fact}</Text>
                  </View>
                ))
              ) : (
                <Text style={[s.menuDesc, { textAlign: "center", paddingVertical: 20 }]}>
                  No memories yet. Keep chatting!
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity style={s.menuCancel} onPress={() => setShowMemory(false)}>
              <Text style={s.menuCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F7" },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 12, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 4 },
  backText: { fontSize: 20, color: COLORS.deep },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", backgroundColor: COLORS.saffronLight, alignItems: "center", justifyContent: "center" },
  headerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarEmoji: { fontSize: 18 },
  headerName: { fontSize: 15, fontWeight: "700", color: COLORS.deep },
  headerStatus: { fontSize: 11, color: COLORS.subtle },
  kebabBtn: { padding: 8 },
  kebabText: { fontSize: 22, color: COLORS.deep, fontWeight: "700" },

  // Disclaimer
  disclaimer: { marginHorizontal: 12, marginTop: 8, marginBottom: 8, backgroundColor: COLORS.mint, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  disclaimerText: { fontSize: 11, color: COLORS.mintText },

  // Messages
  msgList: { paddingHorizontal: 12, paddingBottom: 8, flexGrow: 1 },
  msgRow: { flexDirection: "row", marginBottom: 10 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAssistant: { justifyContent: "flex-start" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, overflow: "hidden", backgroundColor: COLORS.saffronLight, alignItems: "center", justifyContent: "center", marginRight: 6, marginTop: 4 },
  msgAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarEmoji: { fontSize: 14 },
  msgBubble: { maxWidth: "78%", padding: 10, paddingHorizontal: 14 },
  msgBubbleUser: { backgroundColor: COLORS.saffron, borderRadius: 16, borderBottomRightRadius: 4 },
  msgBubbleAssistant: { backgroundColor: COLORS.card, borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  msgCharName: { fontSize: 12, fontWeight: "600", color: COLORS.saffron, marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 21 },
  msgTextUser: { color: "#fff" },
  msgTextAssistant: { color: COLORS.ink },
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 6 },

  // Typing
  typingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  typingDots: { flexDirection: "row", gap: 4, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: COLORS.card, borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.border },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.muted },

  // Actions menu

  // Suggestions
  suggestionsPanel: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border },
  suggestionsScroll: { gap: 8 },
  suggestionChip: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionText: { fontSize: 13, color: COLORS.deep },

  // Input
  inputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 6 },
  textInput: { flex: 1, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: COLORS.deep, maxHeight: 100 },
  hashBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hashBtnText: { fontSize: 18, fontWeight: "700", color: COLORS.muted },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  sendBtnActive: { backgroundColor: COLORS.saffron },
  sendBtnText: { fontSize: 18, fontWeight: "700", color: "#fff" },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  micBtnText: { fontSize: 18 },
  recordingIndicator: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#E53935" },
  recordingText: { fontSize: 15, fontWeight: "600", color: "#E53935" },
  cancelRecordBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center", marginRight: 8 },
  cancelRecordText: { fontSize: 16, color: COLORS.muted, fontWeight: "700" },

  // Empty
  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 15, color: COLORS.muted },

  // Modal overlay
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },

  // Menu sheet
  menuSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  menuHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginTop: 12, marginBottom: 16 },
  menuTitle: { fontSize: 18, fontWeight: "700", color: COLORS.deep, paddingHorizontal: 20, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuLabel: { fontSize: 15, fontWeight: "600", color: COLORS.deep },
  menuDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  menuCancel: { marginTop: 12, marginHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.bg, alignItems: "center" },
  menuCancelText: { fontSize: 15, fontWeight: "600", color: COLORS.muted },

  // Memory
  memoryItem: { flexDirection: "row", gap: 8, marginBottom: 10 },
  memoryDot: { fontSize: 14, color: COLORS.saffron, fontWeight: "700" },
  memoryText: { flex: 1, fontSize: 14, color: COLORS.ink, lineHeight: 20 },
});
