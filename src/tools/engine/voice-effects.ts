/**
 * Voice Effects Engine — 9 audio effects via FFmpeg filter chains.
 *
 * Effects: echo, reverb, deep, chipmunk, robot, whisper, radio, megaphone, underwater.
 * Works on both audio files and video files (preserves video stream).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { runFfmpeg as runFfmpegSafe, runFfprobe as runFfprobeSafe } from '../../lib/ffmpeg-run.js';

// ─── Types ──────────────────────────────────────────────────────────

export type VoiceEffect =
  | 'echo'
  | 'reverb'
  | 'deep'
  | 'chipmunk'
  | 'robot'
  | 'whisper'
  | 'radio'
  | 'megaphone'
  | 'underwater';

export interface VoiceEffectConfig {
  inputPath: string;
  outputPath: string;
  /** Voice effect to apply */
  effect: VoiceEffect;
  /** Intensity 0.0-1.0 (default: 0.5). Controls how strong the effect is. */
  intensity?: number;
}

export const ALL_VOICE_EFFECTS: VoiceEffect[] = [
  'echo', 'reverb', 'deep', 'chipmunk', 'robot',
  'whisper', 'radio', 'megaphone', 'underwater',
];

export const VOICE_EFFECT_DESCRIPTIONS: Record<VoiceEffect, string> = {
  echo: 'Indoor/outdoor echo with configurable delay',
  reverb: 'Dense multi-tap reverb (hall-like)',
  deep: 'Lower pitch — deep/bass voice',
  chipmunk: 'Higher pitch — chipmunk/squeaky voice',
  robot: 'Metallic robotic voice (phase zeroing)',
  whisper: 'Breathy whisper effect with randomized phase',
  radio: 'AM radio / telephone quality (bandpass)',
  megaphone: 'Distorted megaphone with resonance',
  underwater: 'Muffled underwater sound (heavy lowpass)',
};

// ─── Effect Filter Builders ─────────────────────────────────────────

function getEffectFilter(effect: VoiceEffect, intensity: number): { filter: string; needsComplexPitch?: boolean; pitchFactor?: number } {
  const i = Math.max(0, Math.min(1, intensity));

  switch (effect) {
    case 'echo': {
      // Scale delay and decay with intensity
      const delay1 = Math.round(30 + i * 470);   // 30-500ms
      const delay2 = Math.round(60 + i * 940);   // 60-1000ms
      const decay1 = (0.2 + i * 0.3).toFixed(2); // 0.2-0.5
      const decay2 = (0.1 + i * 0.2).toFixed(2); // 0.1-0.3
      return { filter: `aecho=0.8:0.9:${delay1}|${delay2}:${decay1}|${decay2}` };
    }

    case 'reverb': {
      // Dense multi-tap approximation of reverb
      const taps = Math.round(3 + i * 7); // 3-10 taps
      const delays: string[] = [];
      const decays: string[] = [];
      for (let t = 1; t <= taps; t++) {
        delays.push(String(Math.round(t * 20)));
        decays.push((0.6 - t * (0.5 / taps)).toFixed(2));
      }
      return { filter: `aecho=0.8:0.9:${delays.join('|')}:${decays.join('|')}` };
    }

    case 'deep': {
      // Lower pitch: factor < 1.0 lowers pitch
      // Intensity 0.0 → factor 0.95 (subtle), 1.0 → factor 0.5 (very deep)
      const factor = 0.95 - i * 0.45; // 0.95 → 0.5
      return { filter: '', needsComplexPitch: true, pitchFactor: factor };
    }

    case 'chipmunk': {
      // Higher pitch: factor > 1.0 raises pitch
      // Intensity 0.0 → factor 1.1 (subtle), 1.0 → factor 2.0 (extreme)
      const factor = 1.1 + i * 0.9; // 1.1 → 2.0
      return { filter: '', needsComplexPitch: true, pitchFactor: factor };
    }

    case 'robot': {
      // Phase zeroing creates metallic robot effect
      // At lower intensity, mix with short echo for metallic quality
      if (i > 0.5) {
        return { filter: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75" };
      }
      // Lighter robot via very short echo
      const delay = Math.round(3 + i * 10);
      return { filter: `aecho=0.8:0.88:${delay}:${(0.3 + i * 0.3).toFixed(2)}` };
    }

    case 'whisper': {
      if (i > 0.5) {
        // Full whisper via phase randomization
        return { filter: "afftfilt=real='hypot(re,im)*cos((random(0)*2-1)*2*3.14)':imag='hypot(re,im)*sin((random(1)*2-1)*2*3.14)':win_size=128:overlap=0.8" };
      }
      // Lighter whisper via filtering
      const vol = (0.6 - i * 0.3).toFixed(2);
      return { filter: `highpass=f=1000,lowpass=f=4000,volume=${vol}` };
    }

    case 'radio': {
      // Bandpass gets narrower with intensity
      const lowCut = Math.round(200 + i * 400);  // 200-600 Hz
      const highCut = Math.round(4000 - i * 2000); // 4000-2000 Hz
      const crush = i > 0.5 ? `,acrusher=bits=${Math.round(12 - i * 6)}:mode=log:aa=1` : '';
      return { filter: `highpass=f=${lowCut},lowpass=f=${highCut}${crush}` };
    }

    case 'megaphone': {
      const bits = Math.round(12 - i * 6); // 12→6 bits
      const vol = (1.5 + i * 1.0).toFixed(1);
      return { filter: `highpass=f=500,lowpass=f=4000,acrusher=bits=${bits}:mode=log:aa=1:samples=1,aecho=0.8:0.88:10:${(0.3 + i * 0.3).toFixed(2)},volume=${vol}` };
    }

    case 'underwater': {
      // Lowpass gets more extreme with intensity
      const cutoff = Math.round(500 - i * 350); // 500→150 Hz
      const vol = (0.9 - i * 0.3).toFixed(2);
      const wobble = i > 0.3 ? `,flanger=delay=5:depth=${Math.round(1 + i * 4)}:speed=0.3` : '';
      return { filter: `lowpass=f=${cutoff}${wobble},volume=${vol}` };
    }

    default:
      throw new Error(`Unknown voice effect: ${effect}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function runFfmpeg(args: string[], timeoutMs = 300_000): Promise<string> {
  return runFfmpegSafe(args, { maxBuffer: 100 * 1024 * 1024, timeoutMs, label: 'voice-effects' });
}

function runFfprobe(args: string[]): Promise<string> {
  return runFfprobeSafe(args, { maxBuffer: 10 * 1024 * 1024, label: 'voice-effects-probe' }).then((s) => s.trim());
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

async function hasVideoStream(filePath: string): Promise<boolean> {
  try {
    const result = await runFfprobe(['-v', 'quiet', '-select_streams', 'v', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath]);
    return result.length > 0;
  } catch { return false; }
}

async function getSampleRate(filePath: string): Promise<number> {
  try {
    const result = await runFfprobe(['-v', 'quiet', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', filePath]);
    const rate = parseInt(result, 10);
    return isNaN(rate) ? 44100 : rate;
  } catch { return 44100; }
}

/** Build chained atempo filters (each must be 0.5-100.0 range) */
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

// ─── Main Function ──────────────────────────────────────────────────

export async function applyVoiceEffect(config: VoiceEffectConfig): Promise<string> {
  const { inputPath, outputPath, effect, intensity = 0.5 } = config;

  assertExists(inputPath, 'Input file');
  ensureDir(outputPath);

  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  logger.info(`Applying voice effect: ${effect} (intensity: ${clampedIntensity})`);

  const effectData = getEffectFilter(effect, clampedIntensity);
  const hasVideo = await hasVideoStream(inputPath);

  if (effectData.needsComplexPitch && effectData.pitchFactor) {
    // Pitch shifting requires asetrate + atempo combination
    const sampleRate = await getSampleRate(inputPath);
    const factor = effectData.pitchFactor;
    const newRate = Math.round(sampleRate * factor);
    const tempoCompensation = 1 / factor;

    const audioFilter = `asetrate=${newRate},${buildAtempoChain(tempoCompensation)},aresample=${sampleRate}`;

    const args = ['-y', '-i', inputPath];
    if (hasVideo) {
      args.push('-af', audioFilter, '-c:v', 'copy', '-movflags', '+faststart');
    } else {
      args.push('-af', audioFilter);
    }
    args.push(outputPath);

    await runFfmpeg(args);
  } else {
    // Standard filter-based effects
    const args = ['-y', '-i', inputPath];
    if (hasVideo) {
      args.push('-af', effectData.filter, '-c:v', 'copy', '-movflags', '+faststart');
    } else {
      args.push('-af', effectData.filter);
    }
    args.push(outputPath);

    await runFfmpeg(args);
  }

  logger.info(`Voice effect applied: ${effect} → ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}
