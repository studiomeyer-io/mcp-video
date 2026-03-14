/**
 * ffmpeg encoding pipeline — stitches PNG frames into cinema-grade video
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import type { EncodingConfig, VideoCodec, VideoFormat } from './types.js';

interface EncodeResult {
  outputPath: string;
  format: string;
  codec: string;
  fps: number;
  sizeBytes: number;
  sizeMB: string;
  duration: number;
  totalFrames: number;
}

const CODEC_MAP: Record<VideoCodec, { codec: string; format: VideoFormat; extraArgs: string[] }> = {
  h264: {
    codec: 'libx264',
    format: 'mp4',
    extraArgs: ['-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  },
  h265: {
    codec: 'libx265',
    format: 'mp4',
    extraArgs: ['-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'],
  },
  vp9: {
    codec: 'libvpx-vp9',
    format: 'webm',
    extraArgs: ['-pix_fmt', 'yuv420p', '-row-mt', '1'],
  },
};

/**
 * Encode a sequence of PNG frames into a video file using ffmpeg
 */
export async function encodeFrames(
  framesDir: string,
  framePattern: string,
  outputPath: string,
  totalFrames: number,
  config: EncodingConfig = {}
): Promise<EncodeResult> {
  const {
    codec: codecName = 'h264',
    crf = 18,
    preset = 'slow',
    fps = 60,
  } = config;

  const codecConfig = CODEC_MAP[codecName];
  const format = config.format ?? codecConfig.format;
  const finalOutput = outputPath.endsWith(`.${format}`)
    ? outputPath
    : `${outputPath}.${format}`;

  // Ensure output directory exists
  const outputDir = path.dirname(finalOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const inputPattern = path.join(framesDir, framePattern);

  const args = [
    '-y',                             // Overwrite output
    '-framerate', String(fps),        // Input frame rate
    '-i', inputPattern,               // Input pattern
    '-c:v', codecConfig.codec,        // Video codec
    '-preset', preset,                // Encoding speed/quality
    '-crf', String(crf),              // Quality factor
    ...codecConfig.extraArgs,         // Codec-specific args
    finalOutput,                      // Output file
  ];

  logger.info(`Encoding ${totalFrames} frames → ${finalOutput} (${codecName}, CRF ${crf}, ${fps}fps)`);

  await runFfmpeg(args);

  // Get file stats
  const stats = fs.statSync(finalOutput);
  const duration = totalFrames / fps;

  return {
    outputPath: finalOutput,
    format,
    codec: codecName,
    fps,
    sizeBytes: stats.size,
    sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
    duration,
    totalFrames,
  };
}

/**
 * Add a fade-in and/or fade-out to an existing video
 */
export async function addFade(
  inputPath: string,
  outputPath: string,
  fadeInDuration: number = 0.5,
  fadeOutDuration: number = 0.5,
  totalDuration: number
): Promise<void> {
  const fadeOutStart = totalDuration - fadeOutDuration;
  const filter = `fade=t=in:st=0:d=${fadeInDuration},fade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}`;

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', filter,
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
}

/**
 * Concatenate multiple video clips with crossfade transitions
 */
export async function concatenateWithTransition(
  clips: string[],
  outputPath: string,
  transitionDuration: number = 1,
  transitionType: string = 'fade'
): Promise<void> {
  if (clips.length < 2) {
    // Single clip — just copy
    if (clips[0] && clips[0] !== outputPath) {
      fs.copyFileSync(clips[0], outputPath);
    }
    return;
  }

  // Build ffmpeg xfade filter chain for multiple clips
  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (const clip of clips) {
    inputs.push('-i', clip);
  }

  // Chain xfade filters
  let prevLabel = '0:v';
  for (let i = 1; i < clips.length; i++) {
    const outLabel = i === clips.length - 1 ? '' : `[v${i}]`;
    const offset = i * 5 - transitionDuration; // Approximate offset
    const filter = `[${prevLabel}][${i}:v]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset}`;
    filterParts.push(filter + (outLabel ? outLabel : ''));
    prevLabel = outLabel ? `v${i}` : '';
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-c:v', 'libx264',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
}

/**
 * Run ffmpeg command and return a promise
 */
function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ffmpeg failed: ${stderr}`);
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
        return;
      }
      logger.debug(`ffmpeg output: ${stderr.slice(-200)}`);
      resolve(stdout);
    });
  });
}

/**
 * Clean up temporary frame files
 */
export function cleanupFrames(framesDir: string): void {
  try {
    if (fs.existsSync(framesDir)) {
      fs.rmSync(framesDir, { recursive: true, force: true });
      logger.debug(`Cleaned up frames: ${framesDir}`);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup frames: ${framesDir}`);
  }
}
