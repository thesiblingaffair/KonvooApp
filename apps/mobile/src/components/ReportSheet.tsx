import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Modal,
  StyleSheet, Pressable, Alert, ActivityIndicator,
} from "react-native";
import { useChatStore } from "../stores/chatStore";
import type { ReportReason } from "@yaari/shared";

interface Props {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  characterName: string;
}

const REPORT_REASONS: { value: ReportReason; label: string; emoji: string }[] = [
  { value: "inappropriate", label: "Inappropriate content", emoji: "🔞" },
  { value: "offensive", label: "Offensive or harmful", emoji: "⚠️" },
  { value: "spam", label: "Spam or repetitive", emoji: "📧" },
  { value: "bug", label: "Bug or glitch", emoji: "🐛" },
  { value: "other", label: "Other", emoji: "💬" },
];

export function ReportSheet({ visible, onClose, conversationId, characterName }: Props) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { reportConversation } = useChatStore();

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setIsSubmitting(true);
    try {
      await reportConversation(conversationId, selectedReason, details || undefined);
      Alert.alert(
        "Report Submitted",
        "Thanks for letting us know. We'll review this conversation.",
        [{ text: "OK", onPress: onClose }]
      );
      setSelectedReason(null);
      setDetails("");
    } catch {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handleBar} />

          <Text style={s.title}>Report Conversation</Text>
          <Text style={s.subtitle}>
            What's wrong with your chat with {characterName}?
          </Text>

          {/* Reason options */}
          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.value}
              style={[
                s.reasonItem,
                selectedReason === reason.value && s.reasonItemSelected,
              ]}
              onPress={() => setSelectedReason(reason.value)}
              activeOpacity={0.7}
            >
              <Text style={s.reasonEmoji}>{reason.emoji}</Text>
              <Text style={[
                s.reasonLabel,
                selectedReason === reason.value && s.reasonLabelSelected,
              ]}>
                {reason.label}
              </Text>
              {selectedReason === reason.value && (
                <Text style={s.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}

          {/* Details input */}
          <TextInput
            style={s.detailsInput}
            placeholder="Additional details (optional)"
            placeholderTextColor="#6B6B80"
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
          />

          {/* Submit button */}
          <TouchableOpacity
            style={[s.submitBtn, !selectedReason && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.submitText}>Submit Report</Text>
            )}
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#1C1C28",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#3A3A4C",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F5F5F0",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#8A8A9A",
    marginBottom: 16,
  },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "#121218",
    borderWidth: 1.5,
    borderColor: "#2A2A3C",
  },
  reasonItemSelected: {
    borderColor: "#E8652B",
    backgroundColor: "rgba(232,101,43,0.08)",
  },
  reasonEmoji: {
    fontSize: 18,
    marginRight: 12,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 15,
    color: "#C8C8D4",
    fontWeight: "500",
  },
  reasonLabelSelected: {
    color: "#F5F5F0",
  },
  checkmark: {
    fontSize: 16,
    color: "#E8652B",
    fontWeight: "700",
  },
  detailsInput: {
    marginTop: 12,
    backgroundColor: "#121218",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A3C",
    padding: 14,
    fontSize: 14,
    color: "#F5F5F0",
    minHeight: 80,
    textAlignVertical: "top",
  },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#E8652B",
    alignItems: "center",
  },
  submitBtnDisabled: {
    backgroundColor: "#3A3A4C",
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
