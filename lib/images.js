// Photos du catalogue : normalise une image envoyée par le navigateur (WebP, 900 px max) et la range dans le stockage d'images.
import sharp from "sharp";
import { saveImageBuffer } from "./store.js";
import { createValidationError } from "./metrics.js";

export async function storeUploadedImage(dataUrl) {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));

  if (!match) {
    throw createValidationError("Image invalide (WebP, JPEG ou PNG).");
  }

  const input = Buffer.from(match[2], "base64");

  if (input.length > 8 * 1024 * 1024) {
    throw createValidationError("Image trop volumineuse.");
  }

  const webp = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: 900, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();

  return saveImageBuffer(webp, "image/webp");
}
