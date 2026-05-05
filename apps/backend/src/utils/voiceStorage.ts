/**
 * Supabase Storage — Voice file upload/retrieval
 *
 * Stores voice notes in a "voices" bucket.
 * Returns public URLs for playback in the mobile app.
 */

import { env } from "../config/env.js";

const BUCKET = "voices";

/**
 * Upload audio buffer to Supabase Storage
 * Returns public URL or null on failure
 */
export async function uploadVoiceFile(
  buffer: Buffer,
  path: string, // e.g. "conversations/abc123/msg_456.mp3"
  contentType: string = "audio/mpeg"
): Promise<string | null> {
  try {
    // Upload via Supabase Storage REST API
    const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true", // Overwrite if exists
      },
      body: buffer,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Supabase upload error:", err);
      return null;
    }

    // Return public URL
    return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (error) {
    console.error("Voice upload error:", error);
    return null;
  }
}
