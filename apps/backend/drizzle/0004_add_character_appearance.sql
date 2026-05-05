-- Add appearance profile and reference image URL for consistent image generation
-- referenceImageUrl: the base face photo used as input to Flux Kontext Pro
-- appearance: JSON describing physical traits, prepended to every image prompt

ALTER TABLE "characters" ADD COLUMN "reference_image_url" text;
ALTER TABLE "characters" ADD COLUMN "appearance" jsonb DEFAULT '{}';
