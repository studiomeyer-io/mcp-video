/**
 * Narrated Video Engine
 * Combines TTS voice generation with website recording
 * for fully automated explainer videos
 *
 * Flow:
 * 1. Generate speech from script segments
 * 2. Record website scenes synchronized to speech durations
 * 3. Merge video + audio into final output
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { generateSpeech } from './tts.js';
import type { TTSProvider, ElevenLabsVoice, ElevenLabsModel, OpenAIVoice, OpenAIModel } from './tts.js';
import { recordWebsite } from './capture.js';
import type { Scene, ViewportPreset } from './types.js';
import { getMediaDuration } from './audio.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface NarrationSegment {
  /** Text to speak for this segment */
  text: string;
  /** Scene action during this segment */
  scene: Scene;
  /** Extra padding time after speech (seconds, default: 0.5) */
  paddingAfter?: number;
}

export interface NarratedVideoConfig {
  /** URL to record */
  url: string;
  /** Narration script segments */
  segments: NarrationSegment[];
  /** Output path (without extension) */
  outputPath: string;
  /** TTS provider (default: elevenlabs) */
  provider?: TTSProvider;
  /** Language (default: en) */
  language?: string;
  /** Viewport (default: desktop) */
  viewport?: ViewportPreset;

  // Voice settings
  /** ElevenLabs voice (default: adam) */
  elevenLabsVoice?: ElevenLabsVoice | string;
  /** ElevenLabs model */
  elevenLabsModel?: ElevenLabsModel;
  /** OpenAI voice */
  openaiVoice?: OpenAIVoice;
  /** OpenAI model */
  openaiModel?: OpenAIModel;
  /** Speaking speed (default: 1.0) */
  speed?: number;

  /** Music volume if background music provided (default: 0.1) */
  backgroundMusicVolume?: number;
  /** Background music path (optional) */
  backgroundMusicPath?: string;
}

export interface NarratedVideoResult {
  success: boolean;
  video: {
    path: string;
    duration: number;
    sizeMB: string;
  };
  audio: {
    totalSegments: number;
    totalDuration: number;
    provider: TTSProvider;
  };
  url: string;
}

// ─── Main Function ──────────────────────────────────────────────────

export async function createNarratedVideo(
  config: NarratedVideoConfig
): Promise<NarratedVideoResult> {
  const {
    url,
    segments,
    outputPath,
    provider = 'elevenlabs',
    language = 'en',
    viewport = 'desktop',
  } = config;

  const tempDir = `/tmp/narrated-video-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // ─── Step 1: Generate all speech segments ───────────────────
    logger.info(`Generating ${segments.length} speech segment(s)...`);
    const audioPaths: string[] = [];
    const audioDurations: number[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const audioPath = path.join(tempDir, `segment-${String(i).padStart(3, '0')}.mp3`);

      const ttsResult = await generateSpeech({
        text: seg.text,
        outputPath: audioPath,
        provider,
        language,
        elevenLabsVoice: config.elevenLabsVoice,
        elevenLabsModel: config.elevenLabsModel,
        openaiVoice: config.openaiVoice,
        openaiModel: config.openaiModel,
        speed: config.speed,
      });

      audioPaths.push(ttsResult.audioPath);
      audioDurations.push(ttsResult.duration);
      logger.info(`Segment ${i + 1}: "${seg.text.slice(0, 50)}..." → ${ttsResult.duration.toFixed(1)}s`);
    }

    // ─── Step 2: Concatenate audio segments ─────────────────────
    logger.info('Concatenating audio segments...');
    const fullAudioPath = path.join(tempDir, 'full-narration.mp3');
    await concatenateAudio(audioPaths, fullAudioPath);

    const totalAudioDuration = await getMediaDuration(fullAudioPath);
    logger.info(`Total narration: ${totalAudioDuration.toFixed(1)}s`);

    // ─── Step 3: Build scenes with matched durations ────────────
    logger.info('Building synchronized scenes...');
    const scenes: Scene[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const padding = seg.paddingAfter ?? 0.5;
      const sceneDuration = audioDurations[i] + padding;

      // Override scene duration to match audio
      const scene = { ...seg.scene };
      if ('duration' in scene) {
        scene.duration = sceneDuration;
      }

      scenes.push(scene);
    }

    // ─── Step 4: Record website with synced scenes ──────────────
    logger.info('Recording website with synchronized scenes...');
    const videoOnlyPath = path.join(tempDir, 'video-only');

    const recordResult = await recordWebsite({
      url,
      outputPath: videoOnlyPath,
      viewport,
      fps: 60,
      scenes,
      cursor: { enabled: false },
      encoding: { codec: 'h264', crf: 18 },
    });

    // ─── Step 5: Merge video + audio ────────────────────────────
    logger.info('Merging video + narration...');
    const finalPath = outputPath.endsWith('.mp4') ? outputPath : `${outputPath}.mp4`;
    const outDir = path.dirname(finalPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const mergeArgs: string[] = [
      '-y',
      '-i', recordResult.video.path,
      '-i', fullAudioPath,
    ];

    // Optional background music
    if (config.backgroundMusicPath && fs.existsSync(config.backgroundMusicPath)) {
      const musicVol = config.backgroundMusicVolume ?? 0.1;
      mergeArgs.push('-stream_loop', '-1', '-i', config.backgroundMusicPath);

      // Mix narration + background music
      mergeArgs.push(
        '-filter_complex',
        `[1:a]volume=1.0[narration];[2:a]volume=${musicVol},afade=t=in:st=0:d=2[music];[narration][music]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
      );
    } else {
      mergeArgs.push('-map', '0:v', '-map', '1:a');
    }

    mergeArgs.push(
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      finalPath,
    );

    await runFfmpeg(mergeArgs);

    const finalStats = fs.statSync(finalPath);
    const finalDuration = await getMediaDuration(finalPath);

    // ─── Cleanup ────────────────────────────────────────────────
    fs.rmSync(tempDir, { recursive: true, force: true });

    logger.info(`Narrated video ready: ${finalPath} (${finalDuration.toFixed(1)}s, ${(finalStats.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      success: true,
      video: {
        path: finalPath,
        duration: finalDuration,
        sizeMB: (finalStats.size / 1024 / 1024).toFixed(2),
      },
      audio: {
        totalSegments: segments.length,
        totalDuration: totalAudioDuration,
        provider,
      },
      url,
    };
  } catch (error) {
    // Cleanup on error
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw error;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Concatenate multiple audio files using ffmpeg concat demuxer
 */
async function concatenateAudio(files: string[], outputPath: string): Promise<void> {
  // Create concat list file
  const listPath = outputPath + '.txt';
  const listContent = files.map((f) => `file '${f}'`).join('\n');
  fs.writeFileSync(listPath, listContent);

  await runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    outputPath,
  ]);

  // Cleanup list file
  fs.unlinkSync(listPath);
}

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
