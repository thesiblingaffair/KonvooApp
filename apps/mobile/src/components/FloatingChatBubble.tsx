import React, { useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, Animated,
} from "react-native";

interface Props {
  characterName: string;
  characterAvatar: string;
  lastMessage: string | null;
  onPress: () => void;
  onDismiss: () => void;
  visible: boolean;
}

export function FloatingChatBubble({
  characterName, characterAvatar, lastMessage,
  onPress, onDismiss, visible,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Bounce in
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();

      // Subtle pulse animation for the glow ring
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        s.container,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      {/* Dismiss button */}
      <TouchableOpacity
        style={s.dismissBtn}
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.dismissText}>✕</Text>
      </TouchableOpacity>

      {/* Main bubble */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.bubbleTouch}>
        {/* Pulse ring */}
        <Animated.View
          style={[
            s.pulseRing,
            { transform: [{ scale: pulseAnim }] },
          ]}
        />

        {/* Avatar */}
        <Image source={{ uri: characterAvatar }} style={s.avatar} />

        {/* Online dot */}
        <View style={s.onlineDot} />
      </TouchableOpacity>

      {/* Name label */}
      {lastMessage && (
        <View style={s.nameTag}>
          <Text style={s.nameText} numberOfLines={1}>
            {characterName}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 90,
    right: 16,
    alignItems: "center",
    zIndex: 100,
  },
  dismissBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#2A2A3C",
    borderWidth: 1.5,
    borderColor: "#121218",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dismissText: {
    fontSize: 9,
    color: "#8A8A9A",
    fontWeight: "700",
  },
  bubbleTouch: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(232, 101, 43, 0.4)",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: "#E8652B",
  },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#34C759",
    borderWidth: 2.5,
    borderColor: "#121218",
  },
  nameTag: {
    marginTop: 4,
    backgroundColor: "rgba(28, 28, 40, 0.95)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nameText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#F5F5F0",
    maxWidth: 80,
  },
});
