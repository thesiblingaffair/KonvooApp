/**
 * Text-to-Speech — OpenAI TTS API
 *
 * Converts AI text replies into audio (Kavya's voice).
 * Uses "nova" voice — warm, young, female. Best for Hindi/Hinglish.
 *
 * Cost: ~$0.015 per 1K characters (~₹0.12 per average reply)
 */

import OpenAI from "openai";
import { env } from "../config/env.js";

// Direct OpenAI client (TTS not available on OpenRouter)
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Voice mapping per character personality
const CHARACTER_VOICES: Record<string, string> = {
  default: "nova",     // Warm, young female — primary voice for most characters
  kavya: "nova",
  meera: "shimmer",    // Slightly different tone for variety
  zara: "nova",
  riya: "shimmer",
  priya: "nova",
  ananya: "shimmer",
  nisha: "nova",
  tara: "shimmer",
};

export async function textToSpeech(
  text: string,
  characterName?: string
): Promise<Buffer | null> {
  try {
    const voice = CHARACTER_VOICES[(characterName || "default").toLowerCase()] || "nova";

    const response = await openai.audio.speech.create({
      model: "tts-1",        // Standard quality (tts-1-hd is 2x cost)
      voice: voice as any,
      input: text,
      response_format: "mp3", // Smallest file size
      speed: 1.0,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error("TTS error:", error);
    return null;
  }
}

/**
 * Estimate TTS cost for a text
 * OpenAI TTS: $0.015 per 1,000 characters
 */
export function estimateTTSCost(text: string): number {
  return (text.length / 1000) * 0.015;
}
