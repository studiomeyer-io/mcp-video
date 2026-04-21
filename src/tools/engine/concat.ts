/**
 * Video concatenation engine — merge multiple clips with cinematic transitions
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { runFfmpeg as runFfmpegSafe } from '../../lib/ffmpeg-run.js';
import { getMediaDuration } from './audio.js';

// ─── Available Transitions ──────────────────────────────────────────

export const TRANSITIONS = [
  'fade', 'fadeblack', 'fadewhite', 'dissolve',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'circlecrop', 'circleopen', 'circleclose',
  'rectcrop', 'vertopen', 'vertclose', 'horzopen', 'horzclose',
  'diagtl', 'diagtr', 'diagbl', 'diagbr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice',
  'radial', 'pixelize',
] as const;

export type TransitionType = typeof TRANSITIONS[number];

// ─── Concatenation ──────────────────────────────────────────────────

export interface ConcatClip {
  /** Path to video file */
  path: string;
  /** Optional: trim start time (seconds) */
  trimStart?: number;
  /** Optional: trim end time (seconds) */
  trimEnd?: number;
}

export interface ConcatConfig {
  /** Video clips to concatenate (in order) */
  clips: ConcatClip[];
  /** Output path */
  outputPath: string;
  /** Transition between clips (default: fade) */
  transition?: TransitionType;
  /** Transition duration in seconds (default: 1) */
  transitionDuration?: number;
  /** Normalize all clips to this resolution (default: 1920x1080) */
  targetWidth?: number;
  targetHeight?: number;
  /** Target FPS (default: 60) */
  targetFps?: number;
}

export async function concatenateVideos(config: ConcatConfig): Promise<string> {
  const {
    clips,
    outputPath,
    transition = 'fade',
    transitionDuration = 1,
    targetWidth = 1920,
    targetHeight = 1080,
    targetFps = 60,
  } = config;

  if (clips.length === 0) throw new Error('No clips provided');

  if (clips.length === 1) {
    fs.copyFileSync(clips[0].path, outputPath);
    return outputPath;
  }

  // Verify all clips exist
  for (const clip of clips) {
    if (!fs.existsSync(clip.path)) throw new Error(`Clip not found: ${clip.path}`);
  }

  // Get durations for each clip
  const durations: number[] = [];
  for (const clip of clips) {
    let dur = await getMediaDuration(clip.path);
    if (clip.trimStart) dur -= clip.trimStart;
    if (clip.trimEnd) dur = Math.min(dur, clip.trimEnd - (clip.trimStart ?? 0));
    durations.push(dur);
  }

  logger.info(`Concatenating ${clips.length} clips (${durations.map(d => d.toFixed(1) + 's').join(' + ')}) with ${transition} transition`);

  const inputs: string[] = [];
  const filterParts: string[] = [];

  // Add inputs
  for (const clip of clips) {
    if (clip.trimStart !== undefined || clip.trimEnd !== undefined) {
      if (clip.trimStart) inputs.push('-ss', String(clip.trimStart));
      if (clip.trimEnd) inputs.push('-to', String(clip.trimEnd));
    }
    inputs.push('-i', clip.path);
  }

  // Normalize all inputs to same resolution and fps
  for (let i = 0; i < clips.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${targetFps}[v${i}]`
    );
  }

  // Chain xfade filters with correct offset calculation
  let cumulativeDuration = durations[0];
  let prevLabel = 'v0';

  for (let i = 1; i < clips.length; i++) {
    const offset = Math.max(0, cumulativeDuration - transitionDuration);
    const outLabel = i === clips.length - 1 ? 'vout' : `xf${i}`;

    filterParts.push(
      `[${prevLabel}][v${i}]xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset.toFixed(3)}[${outLabel}]`
    );

    cumulativeDuration += durations[i] - transitionDuration;
    prevLabel = outLabel;
  }

  // Ensure output dir exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]',
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);

  const stats = fs.statSync(outputPath);
  logger.info(`Concatenated: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  return outputPath;
}

// ─── Intro/Outro Generator ─────────────────────────────────────────

export interface IntroConfig {
  /** Text to display */
  text: string;
  /** Subtitle (optional) */
  subtitle?: string;
  /** Duration in seconds (default: 3) */
  duration?: number;
  /** Background color (default: #0a0a0a) */
  backgroundColor?: string;
  /** Text color (default: white) */
  textColor?: string;
  /** Resolution */
  width?: number;
  height?: number;
  /** FPS (default: 60) */
  fps?: number;
  /** Output path */
  outputPath: string;
}

export async function generateIntro(config: IntroConfig): Promise<string> {
  const {
    text,
    subtitle,
    duration = 3,
    backgroundColor = '#0a0a0a',
    textColor = 'white',
    width = 1920,
    height = 1080,
    fps = 60,
    outputPath,
  } = config;

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Find a usable font
  const fontPath = await findFont();

  // Build drawtext filter with fade animation
  const escapedText = text.replace(/'/g, "\\\\'").replace(/:/g, '\\:');
  let vf = `drawtext=text='${escapedText}':fontfile='${fontPath}':fontsize=72:fontcolor=${textColor}:x=(w-text_w)/2:y=(h-text_h)/2-40:alpha='if(lt(t\\,0.8)\\,t/0.8\\,if(gt(t\\,${duration - 0.8})\\,(${duration}-t)/0.8\\,1))'`;

  if (subtitle) {
    const escapedSub = subtitle.replace(/'/g, "\\\\'").replace(/:/g, '\\:');
    vf += `,drawtext=text='${escapedSub}':fontfile='${fontPath}':fontsize=36:fontcolor=${textColor}@0.7:x=(w-text_w)/2:y=(h-text_h)/2+40:alpha='if(lt(t\\,1.2)\\,0\\,if(lt(t\\,2)\\,(t-1.2)/0.8\\,if(gt(t\\,${duration - 0.8})\\,(${duration}-t)/0.8\\,1)))'`;
  }

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${backgroundColor}:s=${width}x${height}:d=${duration}:r=${fps}`,
    '-vf', vf,
    '-c:v', 'libx264',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Intro generated: ${outputPath}`);
  return outputPath;
}

// ─── Helpers ────────────────────────────────────────────────────────

async function findFont(): Promise<string> {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
}

function runFfmpeg(args: string[]): Promise<string> {
  return runFfmpegSafe(args, { maxBuffer: 50 * 1024 * 1024, label: 'concat' });
}
