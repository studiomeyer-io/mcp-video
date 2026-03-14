/**
 * Video editing engine — speed, color grading, effects, crop, reverse,
 * audio extraction, subtitles, keyframe animation, picture-in-picture.
 *
 * All processing via ffmpeg (no npm dependencies).
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { getMediaDuration } from './audio.js';

// ─── Shared ffmpeg runner ────────────────────────────────────────────

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

/** Check if a media file has an audio stream */
function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath],
      (error, stdout) => {
        if (error) { resolve(false); return; }
        resolve(stdout.trim().length > 0);
      }
    );
  });
}

function fileInfo(filePath: string): string {
  const stats = fs.statSync(filePath);
  return `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
}

// ─── 1. Video Speed ──────────────────────────────────────────────────

export interface SpeedConfig {
  inputPath: string;
  outputPath: string;
  /** Speed factor: 0.25 (4x slower) to 4.0 (4x faster). 1.0 = original. */
  speed: number;
  /** How to handle audio: 'match' adjusts pitch, 'mute' removes, 'original' keeps (may desync). Default: match */
  audioMode?: 'match' | 'mute' | 'original';
}

export async function adjustVideoSpeed(config: SpeedConfig): Promise<string> {
  const { inputPath, outputPath, speed, audioMode = 'match' } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  if (speed < 0.25 || speed > 4.0) throw new Error('Speed must be between 0.25 and 4.0');

  const pts = (1 / speed).toFixed(6);
  const hasAudio = await hasAudioStream(inputPath);
  logger.info(`Adjusting speed: ${speed}x (PTS: ${pts}, audio: ${audioMode}, hasAudio: ${hasAudio})`);

  const videoFilter = `setpts=${pts}*PTS`;

  const args = ['-y', '-i', inputPath];

  if (!hasAudio || audioMode === 'mute') {
    args.push('-vf', videoFilter, '-an');
  } else if (audioMode === 'match') {
    const atempoChain = buildAtempoChain(speed);
    args.push('-filter_complex', `[0:v]${videoFilter}[v];[0:a]${atempoChain}[a]`);
    args.push('-map', '[v]', '-map', '[a]');
  } else {
    args.push('-vf', videoFilter, '-c:a', 'copy');
  }

  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath);

  await runFfmpeg(args);
  logger.info(`Speed adjusted: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

/** Build chained atempo filters (each 0.5-2.0 range) */
function buildAtempoChain(speed: number): string {
  const filters: string[] = [];
  let remaining = speed;

  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);

  return filters.join(',');
}

// ─── 2. Color Grading ───────────────────────────────────────────────

export interface ColorGradeConfig {
  inputPath: string;
  outputPath: string;
  /** Brightness adjustment: -1.0 to 1.0 (0 = no change) */
  brightness?: number;
  /** Contrast: 0.0 to 3.0 (1.0 = no change) */
  contrast?: number;
  /** Saturation: 0.0 to 3.0 (1.0 = no change, 0 = grayscale) */
  saturation?: number;
  /** Gamma: 0.1 to 10.0 (1.0 = no change) */
  gamma?: number;
  /** Color temperature shift: -1.0 (cool/blue) to 1.0 (warm/orange). 0 = neutral */
  temperature?: number;
}

export async function applyColorGrade(config: ColorGradeConfig): Promise<string> {
  const {
    inputPath, outputPath,
    brightness = 0, contrast = 1, saturation = 1,
    gamma = 1, temperature = 0,
  } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const filters: string[] = [];

  // eq filter for brightness, contrast, saturation, gamma
  const eqParts: string[] = [];
  if (brightness !== 0) eqParts.push(`brightness=${brightness.toFixed(3)}`);
  if (contrast !== 1) eqParts.push(`contrast=${contrast.toFixed(3)}`);
  if (saturation !== 1) eqParts.push(`saturation=${saturation.toFixed(3)}`);
  if (gamma !== 1) eqParts.push(`gamma=${gamma.toFixed(3)}`);

  if (eqParts.length > 0) filters.push(`eq=${eqParts.join(':')}`);

  // Temperature via colortemperature filter (ffmpeg 5.1+, fallback to colorchannelmixer)
  if (temperature !== 0) {
    // Warm = boost red/green, reduce blue. Cool = opposite.
    const t = temperature;
    const rr = (1 + t * 0.15).toFixed(3);
    const gg = (1 + t * 0.05).toFixed(3);
    const bb = (1 - t * 0.2).toFixed(3);
    filters.push(`colorchannelmixer=${rr}:0:0:0:0:${gg}:0:0:0:0:${bb}:0`);
  }

  if (filters.length === 0) {
    throw new Error('No color adjustments specified. Set at least one of: brightness, contrast, saturation, gamma, temperature.');
  }

  logger.info(`Applying color grade: ${filters.join(', ')}`);

  const args = [
    '-y', '-i', inputPath,
    '-vf', filters.join(','),
    '-c:a', 'copy',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Color graded: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 3. Video Effects ───────────────────────────────────────────────

export type VideoEffect = 'blur' | 'sharpen' | 'vignette' | 'grayscale' | 'sepia' | 'noise' | 'glow';

export interface EffectConfig {
  inputPath: string;
  outputPath: string;
  /** Effect to apply */
  effect: VideoEffect;
  /** Intensity 0.0-1.0 (default: 0.5) */
  intensity?: number;
}

export async function applyVideoEffect(config: EffectConfig): Promise<string> {
  const { inputPath, outputPath, effect, intensity = 0.5 } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const i = Math.max(0, Math.min(1, intensity));
  let vf: string;

  switch (effect) {
    case 'blur': {
      const radius = Math.round(2 + i * 18); // 2-20
      vf = `boxblur=${radius}:${radius}`;
      break;
    }
    case 'sharpen': {
      const amount = (i * 2).toFixed(2); // 0-2
      vf = `unsharp=5:5:${amount}:5:5:0`;
      break;
    }
    case 'vignette': {
      const angle = (0.3 + i * 0.5).toFixed(2); // 0.3-0.8 radians
      vf = `vignette=angle=${angle}`;
      break;
    }
    case 'grayscale': {
      // Blend: original*(1-i) + grayscale*i via saturation
      const sat = (1 - i).toFixed(3);
      vf = `eq=saturation=${sat}`;
      break;
    }
    case 'sepia': {
      // Desaturate + warm tone
      const desat = (1 - i * 0.8).toFixed(3);
      const warm = (1 + i * 0.15).toFixed(3);
      const coolB = (1 - i * 0.2).toFixed(3);
      vf = `eq=saturation=${desat},colorchannelmixer=${warm}:0:0:0:0:1:0:0:0:0:${coolB}:0`;
      break;
    }
    case 'noise': {
      const strength = Math.round(5 + i * 40); // 5-45 (higher values explode file size)
      vf = `noise=alls=${strength}:allf=t`;
      break;
    }
    case 'glow': {
      // Duplicate + blur + blend (soft glow)
      const blurR = Math.round(5 + i * 25);
      vf = `split[a][b];[b]boxblur=${blurR}:${blurR}[blurred];[a][blurred]blend=all_mode=screen:all_opacity=${(i * 0.5).toFixed(2)}`;
      break;
    }
    default:
      throw new Error(`Unknown effect: ${effect}`);
  }

  logger.info(`Applying ${effect} (intensity: ${i.toFixed(2)})`);

  // Noise is high-entropy — use higher CRF to keep file size sane
  const crf = effect === 'noise' ? '35' : '18';

  const args = [
    '-y', '-i', inputPath,
    '-vf', vf,
    '-c:a', 'copy',
    '-c:v', 'libx264', '-crf', crf, '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  // glow uses filter_complex (split+blend) — needs different arg structure
  if (effect === 'glow') {
    args.length = 0;
    args.push(
      '-y', '-i', inputPath,
      '-filter_complex', `[0:v]${vf}[out]`,
      '-map', '[out]', '-map', '0:a?',
      '-c:v', 'libx264', '-crf', crf, '-preset', 'medium',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    );
  }

  await runFfmpeg(args);
  logger.info(`Effect applied: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 4. Crop Video ──────────────────────────────────────────────────

export interface CropConfig {
  inputPath: string;
  outputPath: string;
  /** X offset (pixels or 'center') */
  x?: number | 'center';
  /** Y offset (pixels or 'center') */
  y?: number | 'center';
  /** Width of crop region */
  width: number;
  /** Height of crop region */
  height: number;
}

export async function cropVideo(config: CropConfig): Promise<string> {
  const { inputPath, outputPath, width, height, x = 'center', y = 'center' } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const xExpr = x === 'center' ? '(iw-ow)/2' : String(x);
  const yExpr = y === 'center' ? '(ih-oh)/2' : String(y);

  logger.info(`Cropping to ${width}x${height} at ${xExpr},${yExpr}`);

  const args = [
    '-y', '-i', inputPath,
    '-vf', `crop=${width}:${height}:${xExpr}:${yExpr}`,
    '-c:a', 'copy',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Cropped: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 5. Reverse Clip ────────────────────────────────────────────────

export interface ReverseConfig {
  inputPath: string;
  outputPath: string;
  /** Also reverse audio (default: true) */
  reverseAudio?: boolean;
}

export async function reverseClip(config: ReverseConfig): Promise<string> {
  const { inputPath, outputPath, reverseAudio = true } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const hasAudio = await hasAudioStream(inputPath);
  logger.info(`Reversing video (audio: ${reverseAudio}, hasAudio: ${hasAudio})`);

  const args = ['-y', '-i', inputPath];

  if (!hasAudio) {
    args.push('-vf', 'reverse', '-an');
  } else if (reverseAudio) {
    args.push('-vf', 'reverse', '-af', 'areverse');
  } else {
    args.push('-vf', 'reverse', '-c:a', 'copy');
  }

  args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath);

  await runFfmpeg(args);
  logger.info(`Reversed: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 6. Extract Audio ───────────────────────────────────────────────

export interface ExtractAudioConfig {
  inputPath: string;
  outputPath: string;
  /** Output format: mp3, aac, wav, flac (default: mp3) */
  format?: 'mp3' | 'aac' | 'wav' | 'flac';
  /** Audio bitrate for lossy (default: 192k) */
  bitrate?: string;
}

export async function extractAudio(config: ExtractAudioConfig): Promise<string> {
  const { inputPath, outputPath, format = 'mp3', bitrate = '192k' } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  const hasAudio = await hasAudioStream(inputPath);
  if (!hasAudio) throw new Error('Input video has no audio stream to extract');

  logger.info(`Extracting audio as ${format}`);

  const args = ['-y', '-i', inputPath, '-vn'];

  switch (format) {
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
      break;
    case 'aac':
      args.push('-c:a', 'aac', '-b:a', bitrate);
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    case 'flac':
      args.push('-c:a', 'flac');
      break;
  }

  args.push(outputPath);
  await runFfmpeg(args);
  logger.info(`Audio extracted: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 7. Burn Subtitles ──────────────────────────────────────────────

export interface BurnSubtitlesConfig {
  inputPath: string;
  outputPath: string;
  /** Path to SRT or ASS subtitle file */
  subtitlePath: string;
  /** Font size (default: 24) */
  fontSize?: number;
  /** Font color (default: white) */
  fontColor?: string;
  /** Outline color (default: black) */
  outlineColor?: string;
  /** Outline width (default: 2) */
  outlineWidth?: number;
  /** Position: bottom, top, center (default: bottom) */
  position?: 'bottom' | 'top' | 'center';
}

export async function burnSubtitles(config: BurnSubtitlesConfig): Promise<string> {
  const {
    inputPath, outputPath, subtitlePath,
    fontSize = 24, fontColor = '&Hffffff', outlineColor = '&H000000',
    outlineWidth = 2, position = 'bottom',
  } = config;

  assertExists(inputPath, 'Input video');
  assertExists(subtitlePath, 'Subtitle file');
  ensureDir(outputPath);

  // Determine alignment based on position (ASS alignment values)
  const alignment = position === 'top' ? 8 : position === 'center' ? 5 : 2;
  const marginV = position === 'center' ? 0 : 30;

  // Escape path for ffmpeg (backslashes and colons)
  const escapedSubPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');

  const styleOverride = `FontSize=${fontSize},PrimaryColour=${fontColor},OutlineColour=${outlineColor},Outline=${outlineWidth},Alignment=${alignment},MarginV=${marginV}`;

  logger.info(`Burning subtitles (${position}, size: ${fontSize})`);

  const args = [
    '-y', '-i', inputPath,
    '-vf', `subtitles='${escapedSubPath}':force_style='${styleOverride}'`,
    '-c:a', 'copy',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Subtitles burned: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 8. Auto Caption (Whisper → SRT → burn) ─────────────────────────

export interface AutoCaptionConfig {
  inputPath: string;
  outputPath: string;
  /** Language code (default: auto-detect) */
  language?: string;
  /** Font size for captions (default: 28) */
  fontSize?: number;
  /** Caption position (default: bottom) */
  position?: 'bottom' | 'top' | 'center';
  /** Also return the SRT file path (default: true) */
  keepSrt?: boolean;
}

export interface AutoCaptionResult {
  videoPath: string;
  srtPath: string;
}

export async function autoCaption(config: AutoCaptionConfig): Promise<AutoCaptionResult> {
  const {
    inputPath, outputPath,
    language, fontSize = 28, position = 'bottom',
    keepSrt = true,
  } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  // Step 1: Extract audio to temp WAV
  const tempDir = path.join('/tmp', `caption-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const tempAudio = path.join(tempDir, 'audio.wav');
  const srtPath = outputPath.replace(/\.[^.]+$/, '.srt');

  logger.info('Step 1/3: Extracting audio for transcription...');
  await extractAudio({
    inputPath,
    outputPath: tempAudio,
    format: 'wav',
  });

  // Step 2: Transcribe with Whisper API
  logger.info('Step 2/3: Transcribing with Whisper...');
  const srtContent = await transcribeWithWhisper(tempAudio, language);
  fs.writeFileSync(srtPath, srtContent, 'utf-8');
  logger.info(`SRT written: ${srtPath} (${srtContent.split('\n\n').length} segments)`);

  // Step 3: Burn subtitles
  logger.info('Step 3/3: Burning captions into video...');
  await burnSubtitles({
    inputPath,
    outputPath,
    subtitlePath: srtPath,
    fontSize,
    position,
  });

  // Cleanup temp
  try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  if (!keepSrt) try { fs.unlinkSync(srtPath); } catch { /* ignore */ }

  return { videoPath: outputPath, srtPath };
}

async function transcribeWithWhisper(audioPath: string, language?: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for auto-captioning (Whisper API)');

  const fileBuffer = fs.readFileSync(audioPath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'audio/wav' }), 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'srt');
  if (language) formData.append('language', language);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API failed (${response.status}): ${error}`);
  }

  return await response.text();
}

// ─── 9. Keyframe Animation ──────────────────────────────────────────

export interface Keyframe {
  /** Time in seconds */
  time: number;
  /** Scale factor (1.0 = original, 2.0 = 2x zoom) */
  scale?: number;
  /** Pan X offset in pixels (0 = center) */
  panX?: number;
  /** Pan Y offset in pixels (0 = center) */
  panY?: number;
  /** Rotation in degrees */
  rotate?: number;
}

export interface KeyframeAnimationConfig {
  inputPath: string;
  outputPath: string;
  /** Keyframes defining animation over time */
  keyframes: Keyframe[];
  /** Output width (default: source width) */
  outputWidth?: number;
  /** Output height (default: source height) */
  outputHeight?: number;
}

export async function addKeyframeAnimation(config: KeyframeAnimationConfig): Promise<string> {
  const { inputPath, outputPath, keyframes } = config;
  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  if (keyframes.length < 2) throw new Error('Need at least 2 keyframes for animation');

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Get video info for calculating crop/zoom
  const duration = await getMediaDuration(inputPath);
  const videoInfo = await getVideoResolution(inputPath);
  const outW = config.outputWidth ?? videoInfo.width;
  const outH = config.outputHeight ?? videoInfo.height;

  logger.info(`Keyframe animation: ${sorted.length} keyframes over ${duration.toFixed(1)}s`);

  // Build zoompan filter expression
  // zoompan requires frame-by-frame zoom/x/y expressions
  // We interpolate between keyframes linearly
  const fps = 60;

  const zoomExpr = buildInterpolationExpr(sorted, 'scale', 1, fps);
  const panXExpr = buildInterpolationExpr(sorted, 'panX', 0, fps);
  const panYExpr = buildInterpolationExpr(sorted, 'panY', 0, fps);

  // zoompan: zoom=expr, x=expr, y=expr, d=1 (per-frame), s=output size, fps=fps
  const filter = `zoompan=z='${zoomExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=${outW}x${outH}:fps=${fps}`;

  const args = [
    '-y', '-i', inputPath,
    '-vf', filter,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    '-c:a', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args, 600_000); // Longer timeout for keyframe processing
  logger.info(`Keyframe animation applied: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

/** Build ffmpeg expression that interpolates between keyframe values per-frame */
function buildInterpolationExpr(keyframes: Keyframe[], prop: 'scale' | 'panX' | 'panY', defaultVal: number, fps: number): string {
  if (keyframes.length === 0) return String(defaultVal);
  if (keyframes.length === 1) return String(keyframes[0][prop] ?? defaultVal);

  // Build piecewise linear interpolation using if() expressions
  // Frame number = on (current frame index in zoompan)
  // We use 'on' which is the output frame index
  const parts: string[] = [];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const kf1 = keyframes[i];
    const kf2 = keyframes[i + 1];
    const v1 = kf1[prop] ?? defaultVal;
    const v2 = kf2[prop] ?? defaultVal;
    const f1 = Math.round(kf1.time * fps);
    const f2 = Math.round(kf2.time * fps);
    const frameRange = f2 - f1;

    if (frameRange <= 0) continue;

    // Linear interpolation: v1 + (v2-v1) * (on-f1) / frameRange
    const slope = ((v2 - v1) / frameRange).toFixed(8);
    const interp = `${v1}+${slope}*(on-${f1})`;

    if (i === 0 && i === keyframes.length - 2) {
      // Only segment — use directly
      parts.push(interp);
    } else if (i === keyframes.length - 2) {
      // Last segment
      parts.push(interp);
    } else {
      parts.push(`if(lt(on,${f2}),${interp},`);
    }
  }

  // Close all if() statements
  const expr = parts.join('') + ')'.repeat(Math.max(0, parts.length - 1));
  return expr;
}

async function getVideoResolution(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', filePath],
      (error, stdout) => {
        if (error) { reject(new Error(`ffprobe failed: ${error.message}`)); return; }
        try {
          const data = JSON.parse(stdout);
          const stream = data.streams?.[0];
          resolve({ width: stream?.width ?? 1920, height: stream?.height ?? 1080 });
        } catch { resolve({ width: 1920, height: 1080 }); }
      }
    );
  });
}

// ─── 10. Picture-in-Picture ─────────────────────────────────────────

export type PipPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface PipConfig {
  /** Main (background) video */
  mainVideo: string;
  /** Overlay (PiP) video */
  overlayVideo: string;
  outputPath: string;
  /** Position of PiP (default: bottom-right) */
  position?: PipPosition;
  /** Scale of PiP relative to main video width: 0.1-0.5 (default: 0.3) */
  scale?: number;
  /** PiP start time in seconds (default: 0) */
  startTime?: number;
  /** PiP end time in seconds (default: end of main video) */
  endTime?: number;
  /** Border radius / rounded corners in px (default: 0) */
  borderWidth?: number;
  /** Border color (default: white) */
  borderColor?: string;
}

export async function composePip(config: PipConfig): Promise<string> {
  const {
    mainVideo, overlayVideo, outputPath,
    position = 'bottom-right', scale = 0.3,
    startTime = 0, endTime,
    borderWidth = 0, borderColor = 'white',
  } = config;

  assertExists(mainVideo, 'Main video');
  assertExists(overlayVideo, 'Overlay video');
  ensureDir(outputPath);

  const s = Math.max(0.1, Math.min(0.5, scale));
  logger.info(`PiP: ${position}, scale: ${s}, border: ${borderWidth}px`);

  // Position expressions
  const margin = 20;
  let xExpr: string, yExpr: string;
  switch (position) {
    case 'top-left':     xExpr = String(margin); yExpr = String(margin); break;
    case 'top-right':    xExpr = `W-w-${margin}`; yExpr = String(margin); break;
    case 'bottom-left':  xExpr = String(margin); yExpr = `H-h-${margin}`; break;
    case 'center':       xExpr = '(W-w)/2'; yExpr = '(H-h)/2'; break;
    case 'bottom-right':
    default:             xExpr = `W-w-${margin}`; yExpr = `H-h-${margin}`; break;
  }

  // Enable expression for time-limited overlay
  const enableExpr = endTime
    ? `:enable='between(t,${startTime},${endTime})'`
    : startTime > 0 ? `:enable='gte(t,${startTime})'` : '';

  let filterComplex: string;

  if (borderWidth > 0) {
    // Add border pad around overlay
    filterComplex = [
      `[1:v]scale=iw*${s}:ih*${s}[pip_raw]`,
      `[pip_raw]pad=iw+${borderWidth * 2}:ih+${borderWidth * 2}:${borderWidth}:${borderWidth}:color=${borderColor}[pip]`,
      `[0:v][pip]overlay=${xExpr}:${yExpr}${enableExpr}[out]`,
    ].join(';');
  } else {
    filterComplex = [
      `[1:v]scale=iw*${s}:ih*${s}[pip]`,
      `[0:v][pip]overlay=${xExpr}:${yExpr}${enableExpr}[out]`,
    ].join(';');
  }

  const args = [
    '-y',
    '-i', mainVideo,
    '-i', overlayVideo,
    '-filter_complex', filterComplex,
    '-map', '[out]', '-map', '0:a?',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`PiP composed: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}

// ─── 11. Audio Ducking ──────────────────────────────────────────────

export interface AudioDuckingConfig {
  inputPath: string;
  outputPath: string;
  /** How much to reduce background when speech detected: 0.0-1.0 (default: 0.3 = reduce to 30%) */
  duckLevel?: number;
  /** Attack time in seconds (default: 0.5) */
  attack?: number;
  /** Release time in seconds (default: 1.0) */
  release?: number;
}

export async function addAudioDucking(config: AudioDuckingConfig): Promise<string> {
  const {
    inputPath, outputPath,
    duckLevel = 0.3, attack = 0.5, release = 1.0,
  } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  logger.info(`Audio ducking: level=${duckLevel}, attack=${attack}s, release=${release}s`);

  // Use compand filter to reduce loud parts and normalize quiet
  // This simulates ducking by applying dynamic range compression
  const threshold = -20; // dB threshold
  const ratio = (1 / duckLevel).toFixed(1);

  const args = [
    '-y', '-i', inputPath,
    '-af', `compand=attacks=${attack}:decays=${release}:points=-80/-80|${threshold}/${threshold}|0/-${Math.round((1 - duckLevel) * 20)}:gain=0`,
    '-c:v', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Audio ducking applied: ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}
