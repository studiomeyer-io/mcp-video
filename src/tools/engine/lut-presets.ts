/**
 * LUT Preset Engine — 22 cinematic color grade presets via FFmpeg filter chains.
 *
 * No external .cube files needed — each preset is a combination of
 * colorbalance, eq, curves, colorchannelmixer, and hue filters.
 * Intensity parameter (0.0-1.0) blends graded output with the original.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export type LutPreset =
  | 'cinematic-teal-orange'
  | 'cinematic-teal-orange-subtle'
  | 'vintage-film'
  | 'vintage-kodachrome'
  | 'cross-process'
  | 'moody-dark'
  | 'warm-golden'
  | 'cold-blue'
  | 'film-noir'
  | 'noir-blue-tint'
  | 'bleach-bypass'
  | 'cyberpunk-neon'
  | 'cyberpunk-teal-pink'
  | 'desaturated-fincher'
  | 'pastel-dream'
  | 'matrix-green'
  | 'sepia'
  | 'blockbuster-extreme'
  | 'muted-forest'
  | 'high-contrast-music'
  | 'faded-lofi'
  | 'sunset-magic-hour';

export interface LutPresetConfig {
  inputPath: string;
  outputPath: string;
  /** The color grade preset to apply */
  preset: LutPreset;
  /** Blend intensity: 0.0 (original) to 1.0 (full effect). Default: 1.0 */
  intensity?: number;
}

// ─── Preset Definitions ─────────────────────────────────────────────

const PRESET_FILTERS: Record<LutPreset, string> = {
  'cinematic-teal-orange':
    "colorbalance=rs=-0.15:gs=-0.05:bs=0.25:rm=0.0:gm=-0.02:bm=0.05:rh=0.15:gh=0.02:bh=-0.2,eq=contrast=1.15:saturation=0.9:gamma=0.95,curves=r='0/0 0.25/0.22 0.5/0.55 0.75/0.80 1/1':b='0/0.05 0.25/0.28 0.5/0.45 0.75/0.70 1/0.9'",

  'cinematic-teal-orange-subtle':
    "colorbalance=rs=-0.1:gs=-0.03:bs=0.18:rh=0.12:gh=0.02:bh=-0.15,eq=contrast=1.1:saturation=0.75:brightness=-0.02,curves=preset=medium_contrast",

  'vintage-film':
    "curves=r='0/0.11 0.42/0.51 1/0.95':g='0/0 0.50/0.48 1/1':b='0/0.22 0.49/0.44 1/0.8',eq=saturation=0.8:contrast=0.9:gamma=1.1,colorbalance=rs=0.05:gs=0.02:bs=-0.05:rh=0.08:gh=0.05:bh=-0.03",

  'vintage-kodachrome':
    "curves=r='0/0 0.15/0.18 0.5/0.58 0.85/0.88 1/1':g='0/0 0.5/0.48 1/0.92':b='0/0.06 0.5/0.44 1/0.85',eq=saturation=1.15:contrast=1.1,colorbalance=rs=0.04:gs=-0.02:bs=0.06:rh=0.06:gh=0.03:bh=-0.08",

  'cross-process':
    "curves=r='0/0.2 0.5/0.6 1/0.9':g='0/0 0.5/0.55 1/1':b='0/0.3 0.5/0.4 1/0.8',eq=saturation=1.15:contrast=1.1",

  'moody-dark':
    "eq=contrast=1.3:brightness=-0.08:saturation=0.65:gamma=0.85,colorbalance=rs=-0.05:gs=-0.02:bs=0.12:rm=-0.03:gm=-0.02:bm=0.05:rh=0.0:gh=-0.02:bh=0.05,curves=master='0/0 0.15/0.05 0.5/0.42 1/0.95'",

  'warm-golden':
    "colorbalance=rs=0.12:gs=0.05:bs=-0.12:rm=0.06:gm=0.03:bm=-0.06:rh=0.1:gh=0.06:bh=-0.1,eq=saturation=1.15:contrast=1.05:brightness=0.03,curves=b='0/0 0.5/0.42 1/0.85'",

  'cold-blue':
    "colorbalance=rs=-0.12:gs=-0.03:bs=0.2:rm=-0.06:gm=-0.02:bm=0.1:rh=-0.08:gh=0.0:bh=0.12,eq=saturation=0.7:contrast=1.1:brightness=0.05:gamma=1.1",

  'film-noir':
    "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3:0,eq=contrast=1.5:brightness=-0.05:gamma=0.9,curves=preset=strong_contrast",

  'noir-blue-tint':
    "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.35:.45:.35:0,eq=contrast=1.4:brightness=-0.04:gamma=0.9",

  'bleach-bypass':
    "eq=contrast=1.4:saturation=0.5:gamma=0.9,curves=preset=strong_contrast,colorbalance=rs=-0.02:gs=-0.02:bs=0.04",

  'cyberpunk-neon':
    "eq=contrast=1.25:saturation=1.6:brightness=-0.05:gamma=0.9,colorbalance=rs=-0.1:gs=-0.15:bs=0.2:rm=0.15:gm=-0.1:bm=0.1:rh=0.2:gh=-0.05:bh=0.15,curves=r='0/0 0.3/0.2 0.6/0.7 1/1':b='0/0.05 0.4/0.5 1/1'",

  'cyberpunk-teal-pink':
    "colorbalance=rs=-0.15:gs=-0.1:bs=0.25:rm=0.2:gm=-0.12:bm=0.12:rh=0.2:gh=-0.08:bh=0.2,eq=saturation=1.5:contrast=1.3:brightness=-0.06,hue=h=5",

  'desaturated-fincher':
    "colorbalance=rs=-0.08:gs=-0.03:bs=0.12:rh=0.08:gh=0.02:bh=-0.1,eq=contrast=1.2:saturation=0.55:brightness=-0.03:gamma=0.92,curves=master='0/0 0.2/0.12 0.5/0.48 0.8/0.82 1/0.95'",

  'pastel-dream':
    "eq=contrast=0.8:saturation=0.6:brightness=0.08:gamma=1.2,curves=master='0.0/0.15 0.5/0.55 1/0.9',colorbalance=rs=0.05:gs=0.03:bs=0.06:rh=0.04:gh=0.04:bh=0.02",

  'matrix-green':
    "colorchannelmixer=rr=0.3:rg=0.6:rb=0.1:gr=0.1:gg=0.9:gb=0.0:br=0.1:bg=0.4:bb=0.5,eq=contrast=1.2:brightness=-0.03:gamma=0.9,curves=preset=increase_contrast",

  'sepia':
    "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0,eq=contrast=1.05:brightness=0.02",

  'blockbuster-extreme':
    "colorbalance=rs=-0.2:gs=-0.1:bs=0.35:rm=0.05:gm=-0.03:bm=0.0:rh=0.2:gh=0.05:bh=-0.25,eq=contrast=1.25:saturation=1.1:gamma=0.92,curves=r='0/0 0.25/0.28 0.5/0.58 1/1':b='0/0.08 0.5/0.42 1/0.85'",

  'muted-forest':
    "colorbalance=rs=0.03:gs=0.05:bs=-0.05:rm=-0.02:gm=0.04:bm=-0.03:rh=0.02:gh=0.02:bh=-0.04,eq=saturation=0.65:contrast=1.05:gamma=1.05,curves=g='0/0 0.5/0.52 1/0.92':r='0/0 0.5/0.48 1/0.95'",

  'high-contrast-music':
    "eq=contrast=1.4:saturation=1.4:brightness=-0.02:gamma=0.85,curves=preset=strong_contrast",

  'faded-lofi':
    "curves=master='0/0.08 0.25/0.2 0.75/0.78 1/0.92':r='0/0.05 1/0.95':b='0/0.08 1/0.88',eq=saturation=0.75:contrast=0.95",

  'sunset-magic-hour':
    "colorbalance=rs=0.06:gs=-0.02:bs=0.08:rm=0.1:gm=0.04:bm=-0.05:rh=0.15:gh=0.08:bh=-0.12,eq=saturation=1.2:contrast=1.1:brightness=0.02,curves=r='0/0 0.5/0.56 1/1':b='0/0.03 0.5/0.44 1/0.88'",
};

/** Human-readable descriptions for each preset */
export const PRESET_DESCRIPTIONS: Record<LutPreset, string> = {
  'cinematic-teal-orange': 'Hollywood blockbuster look — teal shadows, orange highlights (Transformers, Mad Max)',
  'cinematic-teal-orange-subtle': 'Restrained teal-orange for drama/thriller tone',
  'vintage-film': 'Faded 70s film — lifted blacks, warm cast, slightly desaturated',
  'vintage-kodachrome': 'Iconic Kodachrome — saturated reds/yellows, slightly cool shadows',
  'cross-process': 'Vivid, surreal color shifts — the "wrong chemistry" lab look',
  'moody-dark': 'Crushed blacks, cold undertone — dark drama atmosphere',
  'warm-golden': 'Sun-kissed warmth — golden hour / magic hour look',
  'cold-blue': 'Icy blue, desaturated — arctic / winter feel',
  'film-noir': 'Classic black & white with dramatic contrast and deep blacks',
  'noir-blue-tint': 'B&W base with subtle cold blue wash',
  'bleach-bypass': 'High contrast + desaturated + metallic — analog lab technique',
  'cyberpunk-neon': 'Vivid blues, magentas, teals — oversaturated neon city',
  'cyberpunk-teal-pink': 'Teal-pink variant cyberpunk — Blade Runner vibes',
  'desaturated-fincher': 'Muted, controlled palette — David Fincher style (Gone Girl, Seven)',
  'pastel-dream': 'Soft, lifted, airy — low contrast pastel feel',
  'matrix-green': 'Green-tinted computer world from The Matrix',
  'sepia': 'Classic warm sepia tone — antique photograph look',
  'blockbuster-extreme': 'Aggressive orange & teal for action/superhero films',
  'muted-forest': 'Desaturated greens and browns — indie film / A24 aesthetic',
  'high-contrast-music': 'Punchy, vivid, crushed blacks — music video look',
  'faded-lofi': 'Instagram-style faded shadows with slight color cast',
  'sunset-magic-hour': 'Deep warm amber highlights, slightly purple shadows',
};

export const ALL_LUT_PRESETS = Object.keys(PRESET_FILTERS) as LutPreset[];

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

// ─── Main Function ──────────────────────────────────────────────────

export async function applyLutPreset(config: LutPresetConfig): Promise<string> {
  const { inputPath, outputPath, preset, intensity = 1.0 } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const filterChain = PRESET_FILTERS[preset];
  if (!filterChain) {
    throw new Error(`Unknown LUT preset: ${preset}. Available: ${ALL_LUT_PRESETS.join(', ')}`);
  }

  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  logger.info(`Applying LUT preset: ${preset} (intensity: ${clampedIntensity})`);

  let args: string[];

  if (clampedIntensity >= 0.99) {
    // Full intensity — no blending needed
    args = [
      '-y', '-i', inputPath,
      '-vf', filterChain,
      '-c:a', 'copy',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ];
  } else {
    // Partial intensity — blend with original using split+blend
    const origWeight = (1 - clampedIntensity).toFixed(4);
    const gradedWeight = clampedIntensity.toFixed(4);
    const filterComplex = [
      `[0:v]split[original][tograde]`,
      `[tograde]${filterChain}[graded]`,
      `[original][graded]blend=all_expr='A*${origWeight}+B*${gradedWeight}'[out]`,
    ].join(';');

    args = [
      '-y', '-i', inputPath,
      '-filter_complex', filterComplex,
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ];
  }

  await runFfmpeg(args);
  logger.info(`LUT preset applied: ${preset} → ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

/** List all available presets with descriptions */
export function listLutPresets(): Array<{ name: LutPreset; description: string }> {
  return ALL_LUT_PRESETS.map(name => ({
    name,
    description: PRESET_DESCRIPTIONS[name],
  }));
}
