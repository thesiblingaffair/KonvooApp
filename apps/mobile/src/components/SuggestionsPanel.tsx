import React from "react";
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from "react-native";

interface Props {
  suggestions: string[];
  isLoading: boolean;
  visible: boolean;
  onSuggestionPress: (text: string) => void;
  onGenerate: () => void;
  onClose: () => void;
}

export function SuggestionsPanel({
  suggestions, isLoading, visible,
  onSuggestionPress, onGenerate, onClose,
}: Props) {
  if (!visible) return null;

  return (
    <View style={s.container}>
      {/* Close button */}
      <TouchableOpacity style={s.closeBtn} onPress={onClose}>
        <Text style={s.closeBtnText}>✕</Text>
      </TouchableOpacity>

      {isLoading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator color="#E8652B" size="small" />
          <Text style={s.loadingText}>Thinking of replies...</Text>
        </View>
      ) : suggestions.length === 0 ? (
        /* Empty state — no suggestions yet */
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>No suggestions yet</Text>
          <TouchableOpacity style={s.generateBtn} onPress={onGenerate}>
            <Text style={s.generateBtnText}>Generate now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Suggestion chips */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsContainer}
        >
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={s.chip}
              onPress={() => onSuggestionPress(suggestion)}
              activeOpacity={0.7}
            >
              <Text style={s.chipText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}

          {/* Refresh button */}
          <TouchableOpacity style={s.refreshChip} onPress={onGenerate}>
            <Text style={s.refreshIcon}>↻</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#1C1C28",
    borderTopWidth: 1,
    borderTopColor: "#2A2A3C",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  closeBtn: {
    position: "absolute",
    top: 6,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2A2A3C",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 11,
    color: "#E8652B",
    fontWeight: "700",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#8A8A9A",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 4,
  },
  emptyText: {
    fontSize: 13,
    color: "#8A8A9A",
    marginBottom: 6,
  },
  generateBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  generateBtnText: {
    fontSize: 14,
    color: "#E8652B",
    fontWeight: "600",
  },
  chipsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 32,
  },
  chip: {
    backgroundColor: "#2A2A3C",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#3A3A4C",
  },
  chipText: {
    fontSize: 13,
    color: "#F5F5F0",
    fontWeight: "500",
  },
  refreshChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2A2A3C",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8652B",
  },
  refreshIcon: {
    fontSize: 18,
    color: "#E8652B",
    fontWeight: "700",
  },
});
