/**
 * VoiceNoteBubble — WhatsApp/IRA style voice message
 *
 * Shows: Play/Pause button | Waveform bars | Duration
 * Matches the IRA reference screenshot styling
 */

import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface Props {
  messageId: string;
  voiceUrl: string;
  duration?: number;
  isUser: boolean;
  isPlaying: boolean;
  progress: number; // 0 to 1
  onPlay: (messageId: string, voiceUrl: string) => void;
}

// Generate fake waveform bars (consistent per messageId)
function generateBars(messageId: string, count: number = 28): number[] {
  let seed = 0;
  for (let i = 0; i < messageId.length; i++) seed += messageId.charCodeAt(i);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 16807 + 11) % 2147483647;
    bars.push(0.2 + (seed % 100) / 125); // 0.2 to 1.0
  }
  return bars;
}

export function VoiceNoteBubble({
  messageId, voiceUrl, duration = 0, isUser, isPlaying, progress, onPlay,
}: Props) {
  const bars = generateBars(messageId);
  const playedBars = Math.floor(bars.length * progress);
  const durationStr = formatTime(duration);

  const activeColor = isUser ? "#fff" : "#E8652B";
  const inactiveColor = isUser ? "rgba(255,255,255,0.4)" : "rgba(232,101,43,0.3)";
  const textColor = isUser ? "#fff" : "#333";

  return (
    <View style={[st.container, isUser ? st.userBg : st.aiBg]}>
      {/* Play/Pause button */}
      <TouchableOpacity
        style={[st.playBtn, { borderColor: activeColor }]}
        onPress={() => onPlay(messageId, voiceUrl)}
      >
        <Text style={[st.playIcon, { color: activeColor }]}>
          {isPlaying ? "❚❚" : "▶"}
        </Text>
      </TouchableOpacity>

      {/* Waveform */}
      <View style={st.waveform}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              st.bar,
              {
                height: h * 24,
                backgroundColor: i < playedBars ? activeColor : inactiveColor,
              },
            ]}
          />
        ))}
      </View>

      {/* Duration */}
      <Text style={[st.duration, { color: textColor }]}>{durationStr}</Text>
    </View>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const st = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    gap: 10,
    minWidth: 220,
    maxWidth: 280,
  },
  userBg: {
    backgroundColor: "#E8652B",
  },
  aiBg: {
    backgroundColor: "#F5F0EB",
    borderWidth: 1,
    borderColor: "#E5E0DB",
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: {
    fontSize: 14,
    fontWeight: "700",
  },
  waveform: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 28,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
  duration: {
    fontSize: 12,
    fontWeight: "500",
    minWidth: 36,
    textAlign: "right",
  },
});
