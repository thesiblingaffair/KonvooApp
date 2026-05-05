import React, { useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { useChatStore } from "../stores/chatStore";

interface Props {
  conversationId: string;
  characterName: string;
  onClose: () => void;
}

export function MemoryScreen({ conversationId, characterName, onClose }: Props) {
  const {
    memory, isLoadingMemory,
    fetchMemory, deleteMemoryItem, clearMemory,
  } = useChatStore();

  useEffect(() => {
    fetchMemory(conversationId);
  }, [conversationId]);

  const handleDeleteFact = (index: number, fact: string) => {
    Alert.alert(
      "Delete Memory",
      `Remove this memory?\n\n"${fact}"`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMemoryItem(conversationId, index),
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Memories",
      `${characterName} will forget everything about you. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => clearMemory(conversationId),
        },
      ]
    );
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.brainIcon}>🧠</Text>
          <View>
            <Text style={s.title}>{characterName}'s Memory</Text>
            <Text style={s.subtitle}>
              {memory?.totalCount || 0} memories stored
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {isLoadingMemory ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator color="#E8652B" size="large" />
        </View>
      ) : !memory || memory.totalCount === 0 ? (
        /* Empty state */
        <View style={s.emptyContainer}>
          <Text style={s.emptyIcon}>🧠</Text>
          <Text style={s.emptyTitle}>No memories yet</Text>
          <Text style={s.emptyText}>
            As you chat, {characterName} will automatically remember important things about you.
          </Text>
          <View style={s.divider} />
          <Text style={s.footerNote}>
            Memories are automatically extracted from your conversations.{" "}
            {characterName} uses them to personalize responses. You can delete individual memories or clear all of them.
          </Text>
        </View>
      ) : (
        /* Memory list */
        <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent}>
          {/* Summary section */}
          {memory.summary ? (
            <View style={s.summaryCard}>
              <Text style={s.sectionLabel}>Summary</Text>
              <Text style={s.summaryText}>{memory.summary}</Text>
              <View style={s.emotionalBadge}>
                <Text style={s.emotionalText}>
                  Mood: {memory.emotionalState}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Key facts */}
          <Text style={s.sectionLabel}>
            Memories ({memory.totalCount})
          </Text>

          {memory.memories.map((item, index) => (
            <View key={item.id} style={s.memoryItem}>
              <View style={s.memoryBullet} />
              <Text style={s.memoryText}>{item.fact}</Text>
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => handleDeleteFact(index, item.fact)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={s.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Clear all button */}
          <TouchableOpacity style={s.clearAllBtn} onPress={handleClearAll}>
            <Text style={s.clearAllText}>Clear All Memories</Text>
          </TouchableOpacity>

          <Text style={s.footerNote}>
            Memories are automatically extracted from your conversations.{" "}
            {characterName} uses them to personalize responses.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121218",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A3C",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brainIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F5F5F0",
  },
  subtitle: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2A2A3C",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 14,
    color: "#8A8A9A",
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F5F5F0",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8A9A",
    textAlign: "center",
    lineHeight: 20,
  },
  divider: {
    width: "80%",
    height: 1,
    backgroundColor: "#2A2A3C",
    marginVertical: 24,
  },
  // Scrollable content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: "#1C1C28",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2A2A3C",
  },
  summaryText: {
    fontSize: 14,
    color: "#C8C8D4",
    lineHeight: 20,
  },
  emotionalBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#2A2A3C",
    borderRadius: 8,
  },
  emotionalText: {
    fontSize: 11,
    color: "#E8652B",
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8A8A9A",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  memoryItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1C1C28",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2A2A3C",
  },
  memoryBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E8652B",
    marginTop: 6,
    marginRight: 12,
  },
  memoryText: {
    flex: 1,
    fontSize: 14,
    color: "#F5F5F0",
    lineHeight: 20,
  },
  deleteBtn: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2A2A3C",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 10,
    color: "#8A8A9A",
    fontWeight: "700",
  },
  clearAllBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FF3B30",
    alignItems: "center",
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF3B30",
  },
  footerNote: {
    fontSize: 12,
    color: "#6B6B80",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 20,
  },
});
