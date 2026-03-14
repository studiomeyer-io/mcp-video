/**
 * Chroma Key Engine — Green screen removal and background replacement.
 *
 * Supports:
 * - chromakey (YUV space, best for green/blue screens)
 * - colorkey (RGB space, best for arbitrary key colors)
 * - despill (removes green/blue color spill on edges)
 * - Composite onto replacement background (video, image, or solid color)
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface ChromaKeyConfig {
  /** Input video with green/blue screen */
  inputPath: string;
  outputPath: string;
  /** Key color in hex (e.g., '00FF00' for green, '0000FF' for blue). Default: 00FF00 */
  keyColor?: string;
  /** How close a color must be to the key: 0.01-1.0. Higher = more removal. Default: 0.15 */
  similarity?: number;
  /** Edge softness: 0.0-1.0. Keep low (0.0-0.08) or entire frame becomes transparent. Default: 0.02 */
  blend?: number;
  /** Enable despill to remove green/blue color contamination on edges. Default: true */
  despill?: boolean;
  /** Background replacement — video file, image file, or hex color (e.g., '000000' for black). Required. */
  background: string;
  /** Use colorkey (RGB) instead of chromakey (YUV). Default: false (chromakey) */
  useColorkey?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

function runFfmpeg(args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 100 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ffmpeg failed: ${stderr}`);
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function assertExists(filePath: string, label = 'File'): void {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
}

function fileInfo(filePath: string): string {
  const stats = fs.statSync(filePath);
  return `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
}

function isHexColor(s: string): boolean {
  return /^[0-9a-fA-F]{6}$/.test(s);
}

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'].includes(ext);
}

// ─── Main Function ──────────────────────────────────────────────────

export async function applyChromaKey(config: ChromaKeyConfig): Promise<string> {
  const {
    inputPath,
    outputPath,
    keyColor = '00FF00',
    similarity = 0.15,
    blend = 0.02,
    despill: enableDespill = true,
    background,
    useColorkey = false,
  } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  // Validate key color
  const cleanColor = keyColor.replace(/^#|^0x/, '');
  if (!isHexColor(cleanColor)) {
    throw new Error(`Invalid key color: ${keyColor}. Use 6-digit hex (e.g., 00FF00 for green)`);
  }

  const sim = Math.max(0.01, Math.min(1, similarity));
  const bld = Math.max(0, Math.min(0.1, blend)); // Cap at 0.1 to prevent full-frame transparency

  logger.info(`Chroma key: color=0x${cleanColor}, sim=${sim}, blend=${bld}, despill=${enableDespill}, mode=${useColorkey ? 'colorkey' : 'chromakey'}`);

  // Build the keying filter
  const keyFilter = useColorkey
    ? `colorkey=0x${cleanColor}:${sim}:${bld}`
    : `chromakey=0x${cleanColor}:${sim}:${bld}`;

  // Optional despill
  const despillFilter = enableDespill
    ? getDespillFilter(cleanColor)
    : '';

  const fgFilter = despillFilter
    ? `${keyFilter},${despillFilter}`
    : keyFilter;

  // Determine background type
  const isSolidColor = isHexColor(background.replace(/^#|^0x/, ''));
  const isImage = !isSolidColor && isImageFile(background);
  const isVideo = !isSolidColor && !isImage;

  if (isVideo) assertExists(background, 'Background video');
  if (isImage) assertExists(background, 'Background image');

  let args: string[];

  if (isSolidColor) {
    // Solid color background — use color source
    const bgColor = background.replace(/^#|^0x/, '');
    const filterComplex = [
      `color=c=0x${bgColor}:s=1920x1080:r=30[bg]`,
      `[0:v]${fgFilter}[fg]`,
      `[bg][fg]overlay=shortest=1[out]`,
    ].join(';');

    args = [
      '-y', '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ];
  } else if (isImage) {
    // Image background — use loop to make it a stream
    const filterComplex = [
      `[1:v]${fgFilter}[fg]`,
      `[0:v][fg]overlay=shortest=1[out]`,
    ].join(';');

    args = [
      '-y',
      '-loop', '1', '-i', background,
      '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[out]', '-map', '1:a?',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ];
  } else {
    // Video background
    const filterComplex = [
      `[1:v]${fgFilter}[fg]`,
      `[0:v][fg]overlay=shortest=1[out]`,
    ].join(';');

    args = [
      '-y',
      '-i', background,
      '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[out]', '-map', '1:a?',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ];
  }

  await runFfmpeg(args, 600_000); // Longer timeout for compositing
  logger.info(`Chroma key applied: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

/** Get despill filter based on key color */
function getDespillFilter(hexColor: string): string {
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);

  // Determine dominant channel for despill
  if (g > r && g > b) {
    // Green screen — despill green
    return 'despill=type=0:mix=0.5:green=-1';
  } else if (b > r && b > g) {
    // Blue screen — despill blue
    return 'despill=type=0:mix=0.5:blue=-1';
  }
  // For other colors, skip despill
  return '';
}
