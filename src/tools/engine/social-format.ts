/**
 * Social media format converter — crop, scale, pad for every platform
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Format Definitions ─────────────────────────────────────────────

export const SOCIAL_FORMATS = {
  'instagram-reel':     { width: 1080, height: 1920, maxDuration: 90,  label: 'Instagram Reels (9:16)' },
  'instagram-feed':     { width: 1080, height: 1080, maxDuration: 60,  label: 'Instagram Feed (1:1)' },
  'instagram-story':    { width: 1080, height: 1920, maxDuration: 60,  label: 'Instagram Story (9:16)' },
  'youtube':            { width: 1920, height: 1080, maxDuration: 0,   label: 'YouTube (16:9)' },
  'youtube-short':      { width: 1080, height: 1920, maxDuration: 60,  label: 'YouTube Shorts (9:16)' },
  'tiktok':             { width: 1080, height: 1920, maxDuration: 600, label: 'TikTok (9:16)' },
  'linkedin-landscape': { width: 1920, height: 1080, maxDuration: 600, label: 'LinkedIn (16:9)' },
  'linkedin-square':    { width: 1080, height: 1080, maxDuration: 600, label: 'LinkedIn (1:1)' },
} as const;

export type SocialFormat = keyof typeof SOCIAL_FORMATS;

export type CropStrategy = 'crop' | 'pad' | 'blur-background';

export interface FormatConvertConfig {
  inputPath: string;
  outputPath: string;
  format: SocialFormat;
  /** How to handle aspect ratio mismatch (default: blur-background) */
  strategy?: CropStrategy;
  /** Override max duration (seconds) */
  maxDuration?: number;
}

// ─── Single Format Conversion ───────────────────────────────────────

export async function convertToSocialFormat(config: FormatConvertConfig): Promise<string> {
  const {
    inputPath,
    outputPath,
    format,
    strategy = 'blur-background',
    maxDuration,
  } = config;

  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);

  const spec = SOCIAL_FORMATS[format];
  const { width, height } = spec;
  const durLimit = maxDuration ?? (spec.maxDuration > 0 ? spec.maxDuration : undefined);

  logger.info(`Converting to ${spec.label} (${strategy})`);

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const durArgs = durLimit ? ['-t', String(durLimit)] : [];

  if (strategy === 'blur-background') {
    // Blurred version as background + sharp foreground centered
    const filterComplex = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:20[bg]`,
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`,
    ].join(';');

    const args = [
      '-y', '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
      ...durArgs,
      '-movflags', '+faststart',
      outputPath,
    ];
    await runFfmpeg(args);
  } else if (strategy === 'crop') {
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    const args = [
      '-y', '-i', inputPath,
      '-vf', vf,
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      ...durArgs,
      '-movflags', '+faststart',
      outputPath,
    ];
    await runFfmpeg(args);
  } else {
    // pad — letterbox/pillarbox with black
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
    const args = [
      '-y', '-i', inputPath,
      '-vf', vf,
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      ...durArgs,
      '-movflags', '+faststart',
      outputPath,
    ];
    await runFfmpeg(args);
  }

  const stats = fs.statSync(outputPath);
  logger.info(`Converted: ${outputPath} (${spec.label}, ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  return outputPath;
}

// ─── Batch Conversion ───────────────────────────────────────────────

export async function convertToAllFormats(
  inputPath: string,
  outputDir: string,
  formats: SocialFormat[] = ['instagram-reel', 'instagram-feed', 'youtube', 'tiktok'],
  strategy: CropStrategy = 'blur-background'
): Promise<Record<string, string>> {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const results: Record<string, string> = {};

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  for (const format of formats) {
    const outputPath = path.join(outputDir, `${baseName}-${format}.mp4`);
    results[format] = await convertToSocialFormat({ inputPath, outputPath, format, strategy });
  }

  return results;
}

// ─── Helper ─────────────────────────────────────────────────────────

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ffmpeg failed: ${stderr}`);
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}
