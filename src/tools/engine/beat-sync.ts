/**
 * Beat-Sync Engine — Automatic beat detection + video clip cutting to music beats.
 *
 * Uses FFmpeg's `astats` filter for RMS energy analysis to detect beats/onsets.
 * No external dependencies (no Meyda, no Python) — pure FFmpeg.
 *
 * Flow: Analyze audio → find beat positions → cut clips to beats → concatenate
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface BeatSyncConfig {
  /** Audio/music file to analyze for beats */
  audioPath: string;
  /** Video clips to cut and sync to beats (will be used in order, cycling if needed) */
  clips: string[];
  outputPath: string;
  /** Minimum time between beats in seconds (filters out false positives). Default: 0.3 */
  minBeatInterval?: number;
  /** Maximum number of beats to use (limits output length). Default: 50 */
  maxBeats?: number;
  /** Effect to apply on beat transitions: 'cut' (hard cut), 'flash' (white flash), 'zoom' (quick zoom pulse). Default: 'cut' */
  beatEffect?: 'cut' | 'flash' | 'zoom';
  /** Energy threshold for beat detection: 0.0-1.0 (higher = fewer beats detected). Default: 0.6 */
  sensitivity?: number;
}

export interface BeatSyncResult {
  outputPath: string;
  beatsDetected: number;
  beatsUsed: number;
  beatPositions: number[];
  duration: number;
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
      resolve(stderr); // ffmpeg outputs filter info to stderr
    });
  });
}

function runFfmpegStdout(args: string[], timeoutMs = 300_000): Promise<string> {
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

// ─── Beat Detection ─────────────────────────────────────────────────

/**
 * Detect beats using FFmpeg's audio energy analysis.
 *
 * Strategy: Extract RMS energy per short window, find peaks above threshold.
 * Uses `volumedetect` combined with frame-level energy via `astats`.
 */
async function detectBeats(
  audioPath: string,
  minInterval: number,
  sensitivity: number,
  maxBeats: number,
): Promise<number[]> {
  logger.info('Analyzing audio for beat detection...');

  // Step 1: Get audio duration
  const duration = await getMediaDuration(audioPath);
  if (duration <= 0) throw new Error('Audio file has no duration');

  // Step 2: Extract per-frame RMS energy using astats
  // Output format: one line per analysis window with RMS_level
  const windowSize = 0.05; // 50ms analysis windows (20 frames/sec)
  const tempFile = `/tmp/beat-analysis-${Date.now()}.txt`;

  try {
    // Use ebur128 for momentary loudness — outputs per-frame data to stderr
    const stderr = await runFfmpeg([
      '-i', audioPath,
      '-af', `astats=metadata=1:reset=${Math.round(1 / windowSize)},ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${tempFile}`,
      '-f', 'null', '-',
    ]);

    // Parse the energy data
    if (!fs.existsSync(tempFile)) {
      // Fallback: use simpler approach with volumedetect
      return detectBeatsFallback(audioPath, duration, minInterval, sensitivity, maxBeats);
    }

    const rawData = fs.readFileSync(tempFile, 'utf-8');
    const lines = rawData.split('\n');

    const energyPoints: Array<{ time: number; energy: number }> = [];
    let currentTime = -1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('frame:')) {
        // Extract pts_time
        const timeMatch = trimmed.match(/pts_time:([\d.]+)/);
        if (timeMatch) {
          currentTime = parseFloat(timeMatch[1]);
        }
      } else if (trimmed.startsWith('lavfi.astats.Overall.RMS_level=')) {
        const val = parseFloat(trimmed.split('=')[1]);
        if (currentTime >= 0 && !isNaN(val) && val > -100) {
          // Convert from dB to linear energy (0-1 scale)
          const linearEnergy = Math.pow(10, val / 20);
          energyPoints.push({ time: currentTime, energy: linearEnergy });
        }
      }
    }

    // Cleanup temp file
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }

    if (energyPoints.length < 10) {
      return detectBeatsFallback(audioPath, duration, minInterval, sensitivity, maxBeats);
    }

    // Step 3: Find peaks — energy values that are local maxima and above threshold
    const beats = findPeaks(energyPoints, minInterval, sensitivity, maxBeats);
    logger.info(`Beat detection: ${energyPoints.length} energy frames → ${beats.length} beats`);
    return beats;

  } catch {
    // Cleanup temp file on error
    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
    return detectBeatsFallback(audioPath, duration, minInterval, sensitivity, maxBeats);
  }
}

/** Find peaks in energy data that represent beats */
function findPeaks(
  energyPoints: Array<{ time: number; energy: number }>,
  minInterval: number,
  sensitivity: number,
  maxBeats: number,
): number[] {
  if (energyPoints.length === 0) return [];

  // Calculate dynamic threshold based on energy distribution
  const energies = energyPoints.map(p => p.energy).sort((a, b) => a - b);
  const median = energies[Math.floor(energies.length / 2)];
  const max = energies[energies.length - 1];

  // Threshold: blend between median and max based on sensitivity
  // Higher sensitivity → lower threshold → more beats
  const threshold = median + (max - median) * (1 - sensitivity);

  const beats: number[] = [];
  let lastBeatTime = -minInterval;

  for (let i = 1; i < energyPoints.length - 1; i++) {
    const prev = energyPoints[i - 1].energy;
    const curr = energyPoints[i].energy;
    const next = energyPoints[i + 1].energy;
    const time = energyPoints[i].time;

    // Is this a local maximum above threshold?
    if (curr > prev && curr >= next && curr > threshold) {
      // Respect minimum interval
      if (time - lastBeatTime >= minInterval) {
        beats.push(Math.round(time * 1000) / 1000); // Round to ms
        lastBeatTime = time;

        if (beats.length >= maxBeats) break;
      }
    }
  }

  return beats;
}

/** Fallback beat detection: evenly spaced based on estimated BPM */
async function detectBeatsFallback(
  audioPath: string,
  duration: number,
  minInterval: number,
  _sensitivity: number,
  maxBeats: number,
): Promise<number[]> {
  logger.info('Using fallback beat detection (evenly spaced)');

  // Default to ~120 BPM (0.5s interval) if we can't detect
  const interval = Math.max(minInterval, 0.5);
  const beats: number[] = [];

  for (let t = interval; t < duration && beats.length < maxBeats; t += interval) {
    beats.push(Math.round(t * 1000) / 1000);
  }

  return beats;
}

// ─── Main Function ──────────────────────────────────────────────────

export async function syncToBeats(config: BeatSyncConfig): Promise<BeatSyncResult> {
  const {
    audioPath,
    clips,
    outputPath,
    minBeatInterval = 0.3,
    maxBeats = 50,
    beatEffect = 'cut',
    sensitivity = 0.6,
  } = config;

  assertExists(audioPath, 'Audio/music file');
  if (clips.length === 0) throw new Error('Need at least 1 video clip');
  for (const clip of clips) {
    assertExists(clip, 'Video clip');
  }
  ensureDir(outputPath);

  // Step 1: Detect beats
  const beatPositions = await detectBeats(audioPath, minBeatInterval, sensitivity, maxBeats);
  if (beatPositions.length < 2) {
    throw new Error('Could not detect enough beats in the audio. Try lowering sensitivity.');
  }

  logger.info(`Detected ${beatPositions.length} beats. Creating beat-synced video...`);

  // Step 2: Create segment list — each beat transition = new clip segment
  const tempDir = `/tmp/beatsync-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  const segmentPaths: string[] = [];
  const concatList: string[] = [];

  try {
    for (let i = 0; i < beatPositions.length - 1; i++) {
      const segDuration = beatPositions[i + 1] - beatPositions[i];
      const clipIdx = i % clips.length;
      const clipPath = clips[clipIdx];

      // Get clip duration to pick a random start point
      const clipDur = await getMediaDuration(clipPath);
      const maxStart = Math.max(0, clipDur - segDuration);
      const startOffset = maxStart > 0 ? Math.random() * maxStart : 0;

      const segPath = path.join(tempDir, `seg-${String(i).padStart(4, '0')}.mp4`);

      // Extract segment from clip
      const segArgs = [
        '-y', '-ss', startOffset.toFixed(3),
        '-i', clipPath,
        '-t', segDuration.toFixed(3),
        '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
        '-pix_fmt', 'yuv420p', '-an',
      ];

      // Apply beat effect
      if (beatEffect === 'flash') {
        // White flash at start of each segment (0.05s)
        segArgs.push('-vf', `fade=in:st=0:d=0.05:color=white`);
      } else if (beatEffect === 'zoom') {
        // Quick zoom pulse at start (1.05x → 1.0x over 0.15s)
        segArgs.push('-vf', `zoompan=z='if(lt(on,5),1.05-0.01*on,1)':d=1:s=1920x1080:fps=30`);
      }

      segArgs.push(segPath);

      await runFfmpegStdout(segArgs);
      segmentPaths.push(segPath);
      concatList.push(`file '${segPath}'`);
    }

    // Step 3: Concatenate all segments
    const concatFile = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(concatFile, concatList.join('\n'));

    const tempOutput = path.join(tempDir, 'video-only.mp4');
    await runFfmpegStdout([
      '-y', '-f', 'concat', '-safe', '0', '-i', concatFile,
      '-c', 'copy', tempOutput,
    ]);

    // Step 4: Merge with original audio
    const audioDuration = await getMediaDuration(audioPath);
    const videoDuration = beatPositions[beatPositions.length - 1];

    await runFfmpegStdout([
      '-y',
      '-i', tempOutput,
      '-i', audioPath,
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-t', Math.min(audioDuration, videoDuration).toFixed(3),
      '-movflags', '+faststart',
      '-shortest',
      outputPath,
    ]);

    const finalDuration = Math.min(audioDuration, videoDuration);

    logger.info(`Beat-synced video: ${beatPositions.length - 1} segments, ${finalDuration.toFixed(1)}s → ${outputPath} (${fileInfo(outputPath)})`);

    return {
      outputPath,
      beatsDetected: beatPositions.length,
      beatsUsed: beatPositions.length - 1,
      beatPositions,
      duration: finalDuration,
    };

  } finally {
    // Cleanup temp files
    try { fs.rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  }
}
