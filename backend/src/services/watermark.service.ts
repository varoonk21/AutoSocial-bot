import sharp from "sharp";
import { logger } from "../utils/logger.util.js";

export interface WatermarkOptions {
  /** Logo width as fraction of image width (default 0.15) */
  scale?: number;
  /** Padding from edges in pixels (default 24) */
  padding?: number;
  /** Logo opacity 0-1 (default 0.85) */
  opacity?: number;
  /** Corner placement (default "bottom-right") */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

/**
 * Composites a logo watermark onto an image.
 * Returns the watermarked image buffer (same format as input), or null
 * when compositing isn't possible (caller should use the original).
 * Never throws — watermarking is enhancement, not a publish blocker.
 */
export async function applyWatermark(
  imageBuffer: Buffer,
  logoBuffer: Buffer,
  options: WatermarkOptions = {}
): Promise<Buffer | null> {
  try {
    const { scale = 0.15, padding = 24, opacity = 0.85, position = "bottom-right" } = options;

    const image = sharp(imageBuffer);
    const meta = await image.metadata();
    if (!meta.width || !meta.height) return null;

    const logoWidth = Math.round(meta.width * scale);
    const logo = await sharp(logoBuffer)
      .resize({ width: logoWidth, withoutEnlargement: true })
      .ensureAlpha(opacity)
      .toBuffer();
    const logoMeta = await sharp(logo).metadata();

    const lw = logoMeta.width || logoWidth;
    const lh = logoMeta.height || logoWidth;

    let left: number;
    let top: number;
    switch (position) {
      case "bottom-left":
        left = padding;
        top = meta.height - lh - padding;
        break;
      case "top-right":
        left = meta.width - lw - padding;
        top = padding;
        break;
      case "top-left":
        left = padding;
        top = padding;
        break;
      case "bottom-right":
      default:
        left = meta.width - lw - padding;
        top = meta.height - lh - padding;
        break;
    }

    return await image.composite([{ input: logo, left, top }]).toBuffer();
  } catch (err) {
    logger.warn({ err }, "Watermark compositing failed, using original image");
    return null;
  }
}
