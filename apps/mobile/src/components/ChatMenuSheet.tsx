import React from "react";
import {
  View, Text, TouchableOpacity, Modal,
  StyleSheet, Alert, Pressable,
} from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  characterName: string;
  conversationId: string;
  onMemory: () => void;
  onReset: () => void;
  onDelete: () => void;
  onReport: () => void;
  onShare?: () => void;
}

export function ChatMenuSheet({
  visible, onClose, characterName, conversationId,
  onMemory, onReset, onDelete, onReport, onShare,
}: Props) {

  const handleReset = () => {
    onClose();
    Alert.alert(
      "Reset Chat",
      `This will delete all messages and memories with ${characterName}. The conversation will start fresh.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: onReset,
        },
      ]
    );
  };

  const handleDelete = () => {
    onClose();
    Alert.alert(
      "Delete Conversation",
      `This will permanently delete your conversation with ${characterName}. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: onDelete,
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: "🧠",
      label: "Memory",
      sublabel: `What ${characterName} remembers`,
      onPress: () => { onClose(); onMemory(); },
      color: "#E8652B",
    },
    {
      icon: "🔗",
      label: "Share",
      sublabel: "Share this conversation",
      onPress: () => { onClose(); onShare?.(); },
      color: "#666",
    },
    {
      icon: "🔄",
      label: "Reset Chat",
      sublabel: "Clear messages & memory",
      onPress: handleReset,
      color: "#E8652B",
      isDestructive: true,
    },
    {
      icon: "🚩",
      label: "Report Conversation",
      sublabel: "Something wrong? Let us know",
      onPress: () => { onClose(); onReport(); },
      color: "#E8652B",
      isDestructive: true,
    },
    {
      icon: "🗑️",
      label: "Delete",
      sublabel: "Remove conversation permanently",
      onPress: handleDelete,
      color: "#FF3B30",
      isDestructive: true,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={s.sheet}>
          {/* Handle bar */}
          <View style={s.handleBar} />

          {/* Character name header */}
          <Text style={s.header}>{characterName}</Text>

          {/* Menu items */}
          {menuItems.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[s.menuItem, i === menuItems.length - 1 && s.menuItemLast]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <Text style={s.menuIcon}>{item.icon}</Text>
              <View style={s.menuTextContainer}>
                <Text style={[
                  s.menuLabel,
                  item.isDestructive && s.menuLabelDestructive,
                ]}>
                  {item.label}
                </Text>
                <Text style={s.menuSublabel}>{item.sublabel}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Cancel button */}
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
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
  header: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F5F5F0",
    marginBottom: 16,
    textAlign: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A3C",
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 14,
    width: 32,
    textAlign: "center",
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F5F5F0",
  },
  menuLabelDestructive: {
    color: "#E8652B",
  },
  menuSublabel: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: "#2A2A3C",
    borderRadius: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8A8A9A",
  },
});
