/**
 * Image generation via fal.ai — Flux Kontext Pro
 *
 * Takes a character's reference face image + scene description,
 * generates a new photorealistic image preserving the character's face,
 * uploads to Supabase Storage, and returns a permanent URL.
 */
import { env } from "../config/env.js";
import { uploadImage } from "../db/supabase.js";
import crypto from "crypto";

// Synchronous endpoint — blocks until result is ready (~5-8 seconds)
const FAL_API_URL = "https://fal.run/fal-ai/flux-pro/kontext";

interface CharacterAppearance {
  hair?: string;
  eyes?: string;
  skin?: string;
  build?: string;
  style?: string;
  age?: string;
  gender?: string;
  extras?: string;
}

interface GenerateImageOptions {
  /** The scene description from [IMAGE_REQUEST: ...] */
  sceneDescription: string;
  /** Character's reference face image URL */
  referenceImageUrl: string;
  /** Character's structured appearance profile */
  appearance?: CharacterAppearance;
  /** Character name for prompt context */
  characterName: string;
}

/**
 * Build a detailed prompt from appearance profile + scene description.
 */
/**
 * Sanitize explicit text from AI's IMAGE_REQUEST into a safe visual description.
 * Strips sexual acts/body parts and keeps only visual elements (pose, outfit, setting).
 */
function sanitizeImagePrompt(rawDescription: string): string {
  // Words that indicate sexual acts/explicit content — replace with tame alternatives
  const explicitPatterns = [
    /\b(naked|nude|pussy|cock|dick|penis|vagina|boobs|tits|breasts|nipples|ass|butt|anus)\b/gi,
    /\b(sex|fuck|fucking|sucking|licking|moaning|orgasm|cum|cumming|squirt|masturbat|fingering|penetrat|blowjob|handjob)\b/gi,
    /\b(spread.*legs|legs.*spread|bending over|on.*knees|missionary|doggy|riding)\b/gi,
    /\b(dripping|juices|wet.*for|soaked|throbbing|pulsing|grinding|arching)\b/gi,
  ];

  let cleaned = rawDescription;

  // Check if the prompt is mostly explicit
  let hasExplicit = false;
  for (const pattern of explicitPatterns) {
    if (pattern.test(cleaned)) {
      hasExplicit = true;
      break;
    }
  }

  if (hasExplicit) {
    // If prompt is heavily explicit, replace with a sensual but safe visual description
    // Extract any useful visual context (outfit, setting, pose)
    const visualKeywords: string[] = [];
    const safePatterns = [
      /(?:wearing|in)\s+(?:a\s+)?([^,.\n]+)/i,
      /(?:bedroom|bathroom|kitchen|living room|couch|bed|mirror|shower|pool|beach)/i,
      /(?:selfie|close-?up|full body|portrait)/i,
      /(?:smiling|laughing|winking|biting lip|looking at camera|looking away)/i,
    ];

    for (const p of safePatterns) {
      const match = cleaned.match(p);
      if (match) visualKeywords.push(match[0]);
    }

    // Build a safe but sensual prompt
    if (visualKeywords.length > 0) {
      cleaned = `taking a seductive photo, ${visualKeywords.join(", ")}, intimate mood, warm lighting`;
    } else {
      cleaned = "taking a seductive selfie, looking at camera with a flirty expression, intimate bedroom setting, warm golden lighting, suggestive pose";
    }
  }

  return cleaned;
}

function buildImagePrompt(opts: GenerateImageOptions): string {
  const { sceneDescription, appearance } = opts;

  // Sanitize explicit content from the AI's description
  const cleanScene = sanitizeImagePrompt(sceneDescription);

  const parts: string[] = [];
  if (appearance?.gender) parts.push(appearance.gender);
  if (appearance?.age) parts.push(`in ${appearance.age}`);
  if (appearance?.hair) parts.push(`with ${appearance.hair}`);
  if (appearance?.eyes) parts.push(`${appearance.eyes} eyes`);
  if (appearance?.skin) parts.push(`${appearance.skin} skin tone`);
  if (appearance?.build) parts.push(`${appearance.build} build`);
  if (appearance?.style) parts.push(`wearing ${appearance.style}`);
  if (appearance?.extras) parts.push(appearance.extras);

  const appearanceStr = parts.length > 0
    ? `A ${parts.join(", ")}. `
    : "";

  return `${appearanceStr}${cleanScene}. Photorealistic, natural lighting, high quality portrait photography.`;
}

/**
 * Generate an image using Flux Kontext Pro on fal.ai.
 *
 * Uses the synchronous endpoint (fal.run) which blocks until the image is ready.
 * Typically takes 3-8 seconds.
 */
export async function generateCharacterImage(opts: GenerateImageOptions): Promise<string> {
  if (!env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY not configured");
  }

  const prompt = buildImagePrompt(opts);

  console.log(`🎨 Generating image for ${opts.characterName}: "${prompt.slice(0, 100)}..."`);

  // Call fal.ai synchronous endpoint
  const res = await fetch(FAL_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: opts.referenceImageUrl,
      aspect_ratio: "1:1",
      output_format: "jpeg",
      safety_tolerance: 5,
      num_inference_steps: 28,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("fal.ai error:", res.status, errBody);
    throw new Error(`fal.ai API error: ${res.status}`);
  }

  const data = (await res.json()) as any;

  // Extract image URL from response
  let falImageUrl: string | null = null;
  if (data.images && data.images.length > 0) {
    falImageUrl = data.images[0].url;
  } else if (data.image?.url) {
    falImageUrl = data.image.url;
  }

  if (!falImageUrl) {
    console.error("fal.ai response:", JSON.stringify(data));
    throw new Error("No image URL in fal.ai response");
  }

  console.log(`✅ Image generated for ${opts.characterName}, uploading to storage...`);

  // Download from fal.ai's temporary URL
  const imageRes = await fetch(falImageUrl);
  if (!imageRes.ok) throw new Error("Failed to download generated image");
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  // Upload to Supabase Storage with a unique filename
  const hash = crypto.randomBytes(8).toString("hex");
  const filename = `generated/${opts.characterName.toLowerCase().replace(/\s+/g, "-")}_${hash}.jpg`;
  const permanentUrl = await uploadImage(imageBuffer, filename);

  console.log(`📦 Image stored: ${permanentUrl}`);

  return permanentUrl;
}

/**
 * Generate image with fallback — returns null instead of throwing.
 */
export async function generateCharacterImageSafe(
  opts: GenerateImageOptions
): Promise<string | null> {
  try {
    return await generateCharacterImage(opts);
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
}
