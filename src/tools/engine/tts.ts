/**
 * Text-to-Speech Engine
 * Primary: ElevenLabs (best quality, multilingual)
 * Fallback: OpenAI TTS (reliable, already integrated)
 *
 * No extra npm dependencies — ElevenLabs uses native fetch,
 * OpenAI uses the already-installed openai package
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { getMediaDuration } from './audio.js';

// ─── Types ──────────────────────────────────────────────────────────

export type TTSProvider = 'elevenlabs' | 'openai';

export type ElevenLabsModel =
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

export type ElevenLabsVoice =
  | 'rachel' | 'sarah' | 'emily' | 'charlotte' | 'alice' | 'matilda' | 'lily'
  | 'brian' | 'adam' | 'daniel' | 'josh' | 'james' | 'liam' | 'chris' | 'george';

export type OpenAIVoice =
  | 'alloy' | 'ash' | 'coral' | 'echo' | 'fable'
  | 'nova' | 'onyx' | 'sage' | 'shimmer';

export type OpenAIModel = 'tts-1' | 'tts-1-hd';

export interface TTSConfig {
  /** Text to speak */
  text: string;
  /** Output path for the audio file */
  outputPath: string;
  /** TTS provider (default: elevenlabs) */
  provider?: TTSProvider;
  /** Language code (default: en) */
  language?: string;
  /** Speaking speed (default: 1.0) */
  speed?: number;

  // ElevenLabs specific
  /** ElevenLabs voice name (default: adam) */
  elevenLabsVoice?: ElevenLabsVoice | string;
  /** ElevenLabs model (default: eleven_multilingual_v2) */
  elevenLabsModel?: ElevenLabsModel;
  /** Voice stability 0-1 (default: 0.5) */
  stability?: number;
  /** Voice similarity 0-1 (default: 0.75) */
  similarityBoost?: number;

  // OpenAI specific
  /** OpenAI voice (default: onyx) */
  openaiVoice?: OpenAIVoice;
  /** OpenAI model (default: tts-1-hd) */
  openaiModel?: OpenAIModel;
}

export interface TTSResult {
  success: boolean;
  audioPath: string;
  provider: TTSProvider;
  duration: number;
  sizeBytes: number;
  sizeMB: string;
  text: string;
  language: string;
}

// ─── ElevenLabs Voice IDs ───────────────────────────────────────────

const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  emily: 'LcfcDJNUP1GQjkzn1xUU',
  charlotte: 'XB0fDUnXU5powFXDhCwa',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  matilda: 'XrExE9yKIg1WjnnlVkGX',
  lily: 'pFZP5JQG7iQjIQuC4Bku',
  brian: 'nPczCjzI2devNBz1zQrb',
  adam: 'pNInz6obpgDQGcFmaJgB',
  daniel: 'onwK4e9ZLuTAKqWW03F9',
  josh: 'TxGEqnHWrfWFTfGW9XjX',
  james: 'ZQe5CZNOzWyzPSCn5a3c',
  liam: 'TX3LPaxmHKxFdv7VOQHJ',
  chris: 'iP95p4xoKVk53GoZ742B',
  george: 'JBFqnCBsd6RMkjVDRZzb',
};

// ─── Main TTS Function ─────────────────────────────────────────────

export async function generateSpeech(config: TTSConfig): Promise<TTSResult> {
  const {
    text,
    outputPath,
    provider = getDefaultProvider(),
    language = 'en',
  } = config;

  // Ensure output dir exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Ensure .mp3 extension
  const finalPath = outputPath.endsWith('.mp3') ? outputPath : `${outputPath}.mp3`;

  logger.info(`Generating speech (${provider}, ${language}, ${text.length} chars)`);

  let audioPath: string;

  try {
    if (provider === 'elevenlabs') {
      audioPath = await elevenLabsTTS(config, finalPath);
    } else {
      audioPath = await openaiTTS(config, finalPath);
    }
  } catch (error) {
    // Fallback: try the other provider
    const fallback = provider === 'elevenlabs' ? 'openai' : 'elevenlabs';
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`${provider} TTS failed (${msg}), falling back to ${fallback}`);

    try {
      if (fallback === 'elevenlabs') {
        audioPath = await elevenLabsTTS(config, finalPath);
      } else {
        audioPath = await openaiTTS(config, finalPath);
      }
    } catch (fallbackError) {
      const fbMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Both TTS providers failed. ${provider}: ${msg}, ${fallback}: ${fbMsg}`);
    }
  }

  // Get audio stats
  const stats = fs.statSync(audioPath);
  let duration = 0;
  try {
    duration = await getMediaDuration(audioPath);
  } catch {
    // ffprobe might not parse the file
  }

  logger.info(`Speech generated: ${audioPath} (${duration.toFixed(1)}s, ${(stats.size / 1024).toFixed(0)} KB)`);

  return {
    success: true,
    audioPath,
    provider,
    duration,
    sizeBytes: stats.size,
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    text,
    language,
  };
}

// ─── ElevenLabs Implementation ──────────────────────────────────────

async function elevenLabsTTS(config: TTSConfig, outputPath: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY environment variable not set');

  const voiceName = config.elevenLabsVoice ?? 'adam';
  const voiceId = ELEVENLABS_VOICE_IDS[voiceName] ?? voiceName; // Allow raw voice IDs
  const model = config.elevenLabsModel ?? 'eleven_multilingual_v2';
  const language = config.language ?? 'en';

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  const body: Record<string, unknown> = {
    text: config.text,
    model_id: model,
    language_code: language,
    voice_settings: {
      stability: config.stability ?? 0.5,
      similarity_boost: config.similarityBoost ?? 0.75,
      style: 0.0,
      speed: config.speed ?? 1.0,
      use_speaker_boost: true,
    },
  };

  logger.info(`ElevenLabs TTS: voice=${voiceName}, model=${model}, lang=${language}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  return outputPath;
}

// ─── OpenAI Implementation ──────────────────────────────────────────

async function openaiTTS(config: TTSConfig, outputPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable not set');

  const voice = config.openaiVoice ?? 'onyx';
  const model = config.openaiModel ?? 'tts-1-hd';
  const speed = config.speed ?? 1.0;

  logger.info(`OpenAI TTS: voice=${voice}, model=${model}, speed=${speed}`);

  // Use fetch directly (avoid OpenAI package version issues)
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      voice,
      input: config.text,
      response_format: 'mp3',
      speed,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS API ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  return outputPath;
}

// ─── List ElevenLabs Voices ─────────────────────────────────────────

export async function listElevenLabsVoices(): Promise<Array<{
  voice_id: string;
  name: string;
  category: string;
  language: string;
}>> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY environment variable not set');

  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) throw new Error(`ElevenLabs API ${response.status}`);

  const data = await response.json() as {
    voices: Array<{ voice_id: string; name: string; category: string; labels?: Record<string, string> }>;
  };

  return data.voices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    language: v.labels?.language ?? 'unknown',
  }));
}

// ─── Helper ─────────────────────────────────────────────────────────

function getDefaultProvider(): TTSProvider {
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'openai';
  throw new Error('No TTS API key found. Set ELEVENLABS_API_KEY or OPENAI_API_KEY.');
}
