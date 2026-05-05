/**
 * Speech-to-Text — OpenAI Whisper API
 *
 * Transcribes user voice notes into text for the LLM.
 * Whisper handles Hindi, Hinglish, English, and most Indian languages.
 *
 * Cost: $0.006 per minute (~₹0.05 per 15-second voice note)
 */

import OpenAI, { toFile } from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function speechToText(
  audioBuffer: Buffer,
  filename: string = "voice.mp3"
): Promise<{ text: string; duration?: number } | null> {
  try {
    const file = await toFile(audioBuffer, filename, {
      type: filename.endsWith(".mp3") ? "audio/mpeg"
        : filename.endsWith(".wav") ? "audio/wav"
        : filename.endsWith(".m4a") ? "audio/mp4"
        : "audio/mpeg",
    });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: file,
      language: "hi", // Hint for Hindi/Hinglish (Whisper auto-detects but hint helps)
    });

    return {
      text: transcription.text,
    };
  } catch (error) {
    console.error("STT error:", error);
    return null;
  }
}
