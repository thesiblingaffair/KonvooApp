/**
 * Content moderation using OpenAI Moderation API (FREE — no tokens charged)
 *
 * Policy: Allow adult romantic/flirty content. Block:
 * - sexual/minors (absolute zero tolerance)
 * - violence / graphic violence
 * - self-harm / self-harm intent
 * - harassment / hate speech
 */
import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface ModerationResult {
  safe: boolean;
  flag?: "sexual_minors" | "violence" | "self_harm" | "boundary_violation" | "spam";
  confidence: number;
  reason?: string;
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: content,
    });

    const result = response.results[0];

    if (result.flagged) {
      // ALLOW: regular sexual/flirty content between adults
      // BLOCK: everything else that's harmful

      // Absolute block: sexual content involving minors
      if (result.categories["sexual/minors"]) {
        return {
          safe: false,
          flag: "sexual_minors",
          confidence: Math.max(...Object.values(result.category_scores)),
          reason: "Content involving minors is strictly prohibited.",
        };
      }

      // Block: violence
      if (result.categories.violence || result.categories["violence/graphic"]) {
        return {
          safe: false,
          flag: "violence",
          confidence: Math.max(...Object.values(result.category_scores)),
          reason: `Flagged: violence`,
        };
      }

      // Block: self-harm
      if (result.categories["self-harm"] || result.categories["self-harm/intent"]) {
        return {
          safe: false,
          flag: "self_harm",
          confidence: Math.max(...Object.values(result.category_scores)),
          reason: `Flagged: self-harm`,
        };
      }

      // Block: harassment and hate
      if (result.categories.harassment || result.categories.hate) {
        return {
          safe: false,
          flag: "boundary_violation",
          confidence: Math.max(...Object.values(result.category_scores)),
          reason: `Flagged: harassment/hate`,
        };
      }

      // If only "sexual" was flagged (not minors, not violence, not hate)
      // → Allow it through. This is an adult companion app.
    }

    return { safe: true, confidence: 1.0 };
  } catch (error) {
    console.error("Moderation check failed:", error);
    return { safe: true, confidence: 0 }; // Fail open
  }
}

/**
 * Image prompt moderation — still blocks NSFW image generation
 * (image generation is different from text chat)
 */
export async function moderateImagePrompt(prompt: string): Promise<ModerationResult> {
  try {
    const modCheck = await moderateContent(prompt);
    if (!modCheck.safe) return modCheck;

    const response = await openai.chat.completions.create({
      model: env.OPENAI_UTIL_MODEL,
      max_tokens: 100,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You classify image generation prompts. Respond in JSON only.",
        },
        {
          role: "user",
          content: `Is this image prompt safe? Block: nudity, real people, minors, extreme violence.
Respond: {"safe": true/false, "flag": null/"sexual_minors"/"violence", "reason": "..."}
Prompt: "${prompt}"`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content || '{"safe":true}';
    return JSON.parse(text);
  } catch (error) {
    console.error("Image moderation failed:", error);
    return { safe: true, confidence: 0 };
  }
}
