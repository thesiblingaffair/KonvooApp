/**
 * useVoice — Recording + Playback hook for voice notes
 *
 * Recording: Hold mic → release to send (WhatsApp style)
 * Playback: Tap play on any voice note bubble
 */

import { useState, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") return false;

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      // Duration timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      return true;
    } catch (error) {
      console.error("Failed to start recording:", error);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    uri: string;
    base64: string;
    duration: number;
    format: string;
  } | null> => {
    try {
      if (!recordingRef.current) return null;

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const duration = recordingDuration;

      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);

      // Reset audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (!uri) return null;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Determine format from URI
      const format = uri.endsWith(".m4a") ? "m4a" : uri.endsWith(".wav") ? "wav" : "m4a";

      return { uri, base64, duration, format };
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecording(false);
      return null;
    }
  }, [recordingDuration]);

  const cancelRecording = useCallback(async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (error) {
      console.error("Failed to cancel recording:", error);
    }
  }, []);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

export function useVoicePlayer() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const play = useCallback(async (messageId: string, voiceUrl: string) => {
    try {
      // Stop any currently playing sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (playingId === messageId) {
        // Toggle off if same message
        setPlayingId(null);
        setPlaybackProgress(0);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceUrl },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            if (status.durationMillis) {
              setPlaybackDuration(status.durationMillis / 1000);
              setPlaybackProgress(
                (status.positionMillis || 0) / status.durationMillis
              );
            }
            if (status.didJustFinish) {
              setPlayingId(null);
              setPlaybackProgress(0);
            }
          }
        }
      );

      soundRef.current = sound;
      setPlayingId(messageId);
    } catch (error) {
      console.error("Playback error:", error);
      setPlayingId(null);
    }
  }, [playingId]);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(null);
    setPlaybackProgress(0);
  }, []);

  return { playingId, playbackProgress, playbackDuration, play, stop };
}

/** Format seconds to mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
