/**
 * Supabase client — used for Storage (images) and utilities.
 * Database queries go through Drizzle ORM (db/index.ts), not this client.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

/**
 * Upload an image to Supabase Storage and return public URL.
 */
export async function uploadImage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const contentType = filename.endsWith(".jpg") || filename.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";

  const { data, error } = await supabase.storage
    .from("images")
    .upload(filename, buffer, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from("images")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
