/**
 * Audio engine — background music, fade, loop, volume control
 * All processing via ffmpeg + ffprobe (no npm dependencies)
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── ffprobe helper ─────────────────────────────────────────────────

export function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      (error, stdout) => {
        if (error) reject(new Error(`ffprobe failed: ${error.message}`));
        else resolve(parseFloat(stdout.trim()) || 0);
      }
    );
  });
}

// ─── Background Music ───────────────────────────────────────────────

export interface AddMusicConfig {
  /** Path to video file */
  videoPath: string;
  /** Path to audio file (mp3, wav, aac, ogg) */
  musicPath: string;
  /** Output path */
  outputPath: string;
  /** Music volume 0.0-1.0 (default: 0.25) */
  musicVolume?: number;
  /** Fade in duration in seconds (default: 2) */
  fadeInDuration?: number;
  /** Fade out duration in seconds (default: 3) */
  fadeOutDuration?: number;
  /** Loop music if shorter than video (default: true) */
  loopMusic?: boolean;
}

export async function addBackgroundMusic(config: AddMusicConfig): Promise<string> {
  const {
    videoPath,
    musicPath,
    outputPath,
    musicVolume = 0.25,
    fadeInDuration = 2,
    fadeOutDuration = 3,
    loopMusic = true,
  } = config;

  if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
  if (!fs.existsSync(musicPath)) throw new Error(`Music not found: ${musicPath}`);

  const videoDuration = await getMediaDuration(videoPath);
  const fadeOutStart = Math.max(0, videoDuration - fadeOutDuration);

  logger.info(`Adding music to video (${videoDuration.toFixed(1)}s, volume: ${musicVolume}, fade: ${fadeInDuration}s/${fadeOutDuration}s)`);

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Build audio filter chain
  const musicFilter = [
    `afade=t=in:st=0:d=${fadeInDuration}`,
    `afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`,
    `volume=${musicVolume}`,
  ].join(',');

  const args: string[] = ['-y'];

  // Video input
  args.push('-i', videoPath);

  // Music input (with optional loop)
  if (loopMusic) args.push('-stream_loop', '-1');
  args.push('-i', musicPath);

  // Filter: process music, map to output
  args.push('-filter_complex', `[1:a]${musicFilter}[music]`);
  args.push('-map', '0:v', '-map', '[music]');

  // Encoding
  args.push('-c:v', 'copy');   // Don't re-encode video
  args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-shortest');       // End when video ends
  args.push('-movflags', '+faststart');
  args.push(outputPath);

  await runFfmpeg(args);

  const stats = fs.statSync(outputPath);
  logger.info(`Music added: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  return outputPath;
}

// ─── ffmpeg runner ──────────────────────────────────────────────────

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
