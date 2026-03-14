/**
 * Template Renderer — Renders video templates with user-provided assets.
 *
 * Pipeline: Validate assets → Trim clips → Apply color grade → Add text animations
 * → Concatenate with transitions → Add music → Export (optional social formats)
 *
 * Uses ALL existing engines: editing, lut-presets, text-animations,
 * concat, audio, social-format.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { getTemplate } from './templates.js';
import type { VideoTemplate, TemplateSlot } from './templates.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TemplateAssets {
  /** Map of slot name → file path */
  clips: Record<string, string>;
  /** Map of placeholder name → custom text (overrides defaults) */
  texts?: Record<string, string>;
  /** Background music file path (optional) */
  musicPath?: string;
  /** Music volume: 0.0-1.0. Default: 0.3 */
  musicVolume?: number;
  /** Logo/watermark image path (optional) */
  logoPath?: string;
}

export interface RenderTemplateConfig {
  /** Template ID */
  templateId: string;
  /** User-provided assets */
  assets: TemplateAssets;
  outputPath: string;
  /** Override color grade preset. Omit to use template default. */
  colorGrade?: string;
  /** Also export social format variants. Default: false */
  socialFormats?: boolean;
}

export interface RenderResult {
  outputPath: string;
  template: string;
  duration: number;
  resolution: { width: number; height: number };
  clipsUsed: number;
  textsApplied: number;
  socialVariants?: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function runFfmpeg(args: string[], timeoutMs = 600_000): Promise<string> {
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

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext);
}

/** Escape text for FFmpeg drawtext */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

// ─── Main Render Function ───────────────────────────────────────────

export async function renderTemplate(config: RenderTemplateConfig): Promise<RenderResult> {
  const { templateId, assets, outputPath, colorGrade, socialFormats = false } = config;

  // Step 1: Get template
  const template = getTemplate(templateId);
  if (!template) {
    const available = ['social-reel-hype', 'social-reel-aesthetic', 'product-demo-saas', 'testimonial-single', 'before-after-split', 'slideshow-photo', 'tutorial-howto', 'announcement-launch', 'promo-sale'];
    throw new Error(`Unknown template: ${templateId}. Available: ${available.join(', ')}`);
  }

  // Step 2: Validate required assets
  const requiredSlots = template.slots.filter(s => s.required);
  for (const slot of requiredSlots) {
    if (!assets.clips[slot.name]) {
      throw new Error(`Missing required clip for slot "${slot.name}": ${slot.description}`);
    }
    assertExists(assets.clips[slot.name], `Clip for "${slot.name}"`);
  }

  ensureDir(outputPath);
  const tempDir = `/tmp/template-render-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  logger.info(`Rendering template: ${template.name} (${template.id})`);

  try {
    // Step 3: Prepare each slot — trim to duration, scale to target resolution
    const segmentPaths: string[] = [];
    let timeOffset = 0;
    const usedSlots: TemplateSlot[] = [];

    for (const slot of template.slots) {
      const clipPath = assets.clips[slot.name];
      if (!clipPath) continue; // Skip optional empty slots

      assertExists(clipPath, `Clip for "${slot.name}"`);
      usedSlots.push(slot);

      const segPath = path.join(tempDir, `seg-${segmentPaths.length}.mp4`);
      const { width, height } = template.resolution;

      if (isImageFile(clipPath)) {
        // Image → video (still frame for slot duration)
        await runFfmpeg([
          '-y', '-loop', '1', '-i', clipPath,
          '-t', String(slot.duration),
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
          '-pix_fmt', 'yuv420p', '-r', '30',
          segPath,
        ]);
      } else {
        // Video → trim + scale
        await runFfmpeg([
          '-y', '-i', clipPath,
          '-t', String(slot.duration),
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
          '-pix_fmt', 'yuv420p', '-an', '-r', '30',
          segPath,
        ]);
      }

      segmentPaths.push(segPath);
      timeOffset += slot.duration;
    }

    if (segmentPaths.length === 0) {
      throw new Error('No clips provided for any template slot');
    }

    // Step 4: Concatenate all segments
    const concatFile = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(concatFile, segmentPaths.map(p => `file '${p}'`).join('\n'));

    const concatOutput = path.join(tempDir, 'concatenated.mp4');
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', concatOutput,
    ]);

    // Step 5: Apply color grade
    let gradedOutput = concatOutput;
    const gradePreset = colorGrade ?? template.colorGrade;
    if (gradePreset) {
      gradedOutput = path.join(tempDir, 'graded.mp4');
      try {
        // Import dynamically to avoid circular deps — use FFmpeg directly
        const { applyLutPreset } = await import('./lut-presets.js');
        await applyLutPreset({
          inputPath: concatOutput,
          outputPath: gradedOutput,
          preset: gradePreset as Parameters<typeof applyLutPreset>[0]['preset'],
          intensity: 0.8, // 80% intensity for templates — not too heavy
        });
      } catch (gradeError) {
        logger.warn(`Color grade failed, using ungraded: ${gradeError}`);
        gradedOutput = concatOutput;
      }
    }

    // Step 6: Apply text animations
    let textOutput = gradedOutput;
    let textsApplied = 0;

    for (const placeholder of template.textPlaceholders) {
      const customText = assets.texts?.[placeholder.name] ?? placeholder.defaultText;
      const nextOutput = path.join(tempDir, `text-${textsApplied}.mp4`);

      try {
        const { animateText } = await import('./text-animations.js');
        await animateText({
          inputPath: textOutput,
          outputPath: nextOutput,
          text: customText,
          animation: placeholder.animation as Parameters<typeof animateText>[0]['animation'],
          startTime: placeholder.startTime,
          duration: placeholder.duration,
          fontSize: placeholder.fontSize,
          position: placeholder.position as Parameters<typeof animateText>[0]['position'],
        });
        textOutput = nextOutput;
        textsApplied++;
      } catch (textError) {
        logger.warn(`Text animation "${placeholder.name}" failed: ${textError}`);
      }
    }

    // Step 7: Add music if provided
    let finalOutput = textOutput;
    if (assets.musicPath) {
      assertExists(assets.musicPath, 'Music file');
      finalOutput = path.join(tempDir, 'with-music.mp4');
      const musicVol = (assets.musicVolume ?? 0.3).toFixed(2);

      await runFfmpeg([
        '-y',
        '-i', textOutput,
        '-i', assets.musicPath,
        '-filter_complex', `[1:a]volume=${musicVol}[music];[music]afade=t=out:st=${Math.max(0, timeOffset - 2)}:d=2[musicfade]`,
        '-map', '0:v', '-map', '[musicfade]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-t', String(timeOffset),
        '-movflags', '+faststart',
        '-shortest',
        finalOutput,
      ]);
    }

    // Step 8: Copy to output path
    if (finalOutput !== outputPath) {
      fs.copyFileSync(finalOutput, outputPath);
    }

    logger.info(`Template rendered: ${template.name} → ${outputPath} (${fileInfo(outputPath)})`);

    // Step 9: Social format variants (optional)
    let socialVariants: string[] | undefined;
    if (socialFormats) {
      socialVariants = [];
      const outputDir = path.dirname(outputPath);
      const baseName = path.basename(outputPath, path.extname(outputPath));

      const formats = ['instagram-reel', 'tiktok', 'youtube-short'] as const;
      for (const fmt of formats) {
        try {
          const { convertToSocialFormat } = await import('./social-format.js');
          const variantPath = path.join(outputDir, `${baseName}-${fmt}.mp4`);
          await convertToSocialFormat({
            inputPath: outputPath,
            outputPath: variantPath,
            format: fmt as Parameters<typeof convertToSocialFormat>[0]['format'],
          });
          socialVariants.push(variantPath);
        } catch (fmtError) {
          logger.warn(`Social format ${fmt} failed: ${fmtError}`);
        }
      }
    }

    return {
      outputPath,
      template: template.id,
      duration: timeOffset,
      resolution: template.resolution,
      clipsUsed: usedSlots.length,
      textsApplied,
      socialVariants,
    };

  } finally {
    // Cleanup temp files
    try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  }
}
