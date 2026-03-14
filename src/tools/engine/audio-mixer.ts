/**
 * Audio Mixer Engine — Multi-track audio mixing with auto-ducking.
 *
 * Mixes N audio tracks (voiceover + music + SFX) into one.
 * Auto-ducking: automatically lowers music volume when speech is detected.
 * Per-track: volume, fade in/out.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AudioTrack {
  /** Path to audio or video file (audio stream will be used) */
  path: string;
  /** Volume: 0.0-2.0 (1.0 = original). Default: 1.0 */
  volume?: number;
  /** Fade in duration in seconds (default: 0) */
  fadeIn?: number;
  /** Fade out duration in seconds (default: 0) */
  fadeOut?: number;
  /** Start time offset in seconds — delay this track. Default: 0 */
  delay?: number;
  /** Track role for auto-ducking: 'voice' tracks trigger ducking on 'music' tracks */
  role?: 'voice' | 'music' | 'sfx';
}

export interface AudioMixConfig {
  /** Audio/video tracks to mix together */
  tracks: AudioTrack[];
  outputPath: string;
  /** Enable auto-ducking: music volume reduces when voice is active. Default: false */
  autoDuck?: boolean;
  /** How much to reduce music volume during speech: 0.0-1.0 (0.2 = reduce to 20%). Default: 0.2 */
  duckLevel?: number;
  /** Output format: 'mp3', 'aac', 'wav'. Default: 'aac' */
  format?: 'mp3' | 'aac' | 'wav';
  /** Duration of output in seconds. If omitted, uses longest track. */
  duration?: number;
}

export interface AudioMixResult {
  outputPath: string;
  trackCount: number;
  ducking: boolean;
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

function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      (error, stdout) => {
        if (error) { reject(new Error(`ffprobe failed: ${error.message}`)); return; }
        const dur = parseFloat(stdout.trim());
        resolve(isNaN(dur) ? 0 : dur);
      }
    );
  });
}

// ─── Main Function ──────────────────────────────────────────────────

export async function mixAudioTracks(config: AudioMixConfig): Promise<AudioMixResult> {
  const {
    tracks,
    outputPath,
    autoDuck = false,
    duckLevel = 0.2,
    format = 'aac',
    duration,
  } = config;

  if (tracks.length < 2) throw new Error('Need at least 2 audio tracks to mix');
  if (tracks.length > 8) throw new Error('Maximum 8 tracks supported');

  // Validate all files exist
  for (const track of tracks) {
    assertExists(track.path, `Audio track`);
  }

  ensureDir(outputPath);

  logger.info(`Mixing ${tracks.length} audio tracks (duck: ${autoDuck}, format: ${format})`);

  const args: string[] = ['-y'];
  const filterParts: string[] = [];
  const inputLabels: string[] = [];

  // Add inputs
  for (let i = 0; i < tracks.length; i++) {
    args.push('-i', tracks[i].path);
  }

  // Build per-track filter chains
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const vol = track.volume ?? 1.0;
    const fadeIn = track.fadeIn ?? 0;
    const fadeOut = track.fadeOut ?? 0;
    const delay = track.delay ?? 0;

    const subFilters: string[] = [];

    // Volume adjustment
    if (vol !== 1.0) {
      subFilters.push(`volume=${vol.toFixed(3)}`);
    }

    // Delay (adelay in milliseconds)
    if (delay > 0) {
      subFilters.push(`adelay=${Math.round(delay * 1000)}|${Math.round(delay * 1000)}`);
    }

    // Fade in
    if (fadeIn > 0) {
      subFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
    }

    // Fade out — need duration for this
    if (fadeOut > 0) {
      try {
        const dur = duration ?? await getMediaDuration(track.path);
        if (dur > fadeOut) {
          subFilters.push(`afade=t=out:st=${(dur - fadeOut).toFixed(2)}:d=${fadeOut}`);
        }
      } catch {
        // Skip fade out if we can't get duration
      }
    }

    const label = `a${i}`;
    if (subFilters.length > 0) {
      filterParts.push(`[${i}:a]${subFilters.join(',')}[${label}]`);
    } else {
      filterParts.push(`[${i}:a]anull[${label}]`);
    }
    inputLabels.push(`[${label}]`);
  }

  if (autoDuck && tracks.some(t => t.role === 'voice') && tracks.some(t => t.role === 'music')) {
    // Auto-ducking: use sidechaincompress on music tracks triggered by voice
    const voiceIdx = tracks.findIndex(t => t.role === 'voice');
    const musicIdx = tracks.findIndex(t => t.role === 'music');

    if (voiceIdx !== -1 && musicIdx !== -1) {
      const voiceLabel = `a${voiceIdx}`;
      const musicLabel = `a${musicIdx}`;
      const duckRatio = Math.round(1 / Math.max(0.05, duckLevel));

      // Sidechain compress: music is ducked when voice is loud
      filterParts.push(
        `[${musicLabel}][${voiceLabel}]sidechaincompress=threshold=0.02:ratio=${duckRatio}:attack=20:release=300:level_sc=1[ducked]`
      );

      // Build final mix — replace music label with ducked
      const mixLabels = inputLabels.map((label, idx) => {
        if (idx === musicIdx) return '[ducked]';
        if (idx === voiceIdx) return `[${voiceLabel}]`;
        return label;
      });

      // Use amix to combine all
      filterParts.push(
        `${mixLabels.join('')}amix=inputs=${tracks.length}:duration=longest:dropout_transition=2:normalize=0[out]`
      );
    } else {
      // Fallback: simple amix
      filterParts.push(
        `${inputLabels.join('')}amix=inputs=${tracks.length}:duration=longest:dropout_transition=2:normalize=0[out]`
      );
    }
  } else {
    // Simple amix without ducking
    filterParts.push(
      `${inputLabels.join('')}amix=inputs=${tracks.length}:duration=longest:dropout_transition=2:normalize=0[out]`
    );
  }

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[out]');

  // Duration limit
  if (duration) {
    args.push('-t', String(duration));
  }

  // Output codec
  switch (format) {
    case 'mp3':
      args.push('-c:a', 'libmp3lame', '-b:a', '192k');
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    case 'aac':
    default:
      args.push('-c:a', 'aac', '-b:a', '192k');
      break;
  }

  args.push(outputPath);

  await runFfmpeg(args);
  logger.info(`Audio mixed: ${tracks.length} tracks → ${outputPath} (${fileInfo(outputPath)})`);

  return {
    outputPath,
    trackCount: tracks.length,
    ducking: autoDuck,
  };
}
