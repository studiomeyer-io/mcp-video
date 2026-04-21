/**
 * TTS & Narrated Video tool handlers
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import { guardUrl } from '../lib/url-guard.js';
import {
  generateSpeech,
  listElevenLabsVoices,
  createNarratedVideo,
} from '../tools/index.js';
import type {
  TTSConfig,
  TTSProvider,
  NarrationSegment,
} from '../tools/index.js';
import type { ViewportPreset, Scene } from '../tools/engine/types.js';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || './output';

export const ttsHandlers: Record<string, ToolHandler> = {

  generate_speech: async (args) => {
    try {
      const config: TTSConfig = {
        text: args.text,
        outputPath: args.outputPath ?? `${OUTPUT_DIR}/speech-${Date.now()}.mp3`,
        provider: args.provider as TTSProvider | undefined,
        language: args.language ?? 'en',
        speed: args.speed,
        elevenLabsVoice: args.elevenLabsVoice,
        elevenLabsModel: args.elevenLabsModel,
        openaiVoice: args.openaiVoice,
        openaiModel: args.openaiModel,
        stability: args.stability,
        similarityBoost: args.similarityBoost,
      };

      const result = await generateSpeech(config);
      return jsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`generate_speech failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  list_voices: async () => {
    try {
      const voices = await listElevenLabsVoices();
      return jsonResponse({
        success: true,
        voices,
        totalVoices: voices.length,
        premade: [
          'rachel (F)', 'sarah (F)', 'emily (F)', 'charlotte (F)', 'alice (F)',
          'brian (M)', 'adam (M)', 'daniel (M)', 'josh (M)', 'james (M)', 'liam (M)',
        ],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`list_voices failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  create_narrated_video: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);

      const segments: NarrationSegment[] = (args.segments as Array<{
        text: string;
        scene: Scene;
        paddingAfter?: number;
      }>).map((s) => ({
        text: s.text,
        scene: s.scene,
        paddingAfter: s.paddingAfter,
      }));

      const hostname = new URL(guard.url).hostname.replace(/^www\./, '').replace(/\./g, '-');
      const defaultOutput = `${OUTPUT_DIR}/narrated-${hostname}-${new Date().toISOString().slice(0, 10)}`;

      const result = await createNarratedVideo({
        url: guard.url,
        segments,
        outputPath: args.outputPath ?? defaultOutput,
        provider: args.provider as TTSProvider | undefined,
        language: args.language ?? 'en',
        viewport: (args.viewport as ViewportPreset) ?? 'desktop',
        elevenLabsVoice: args.elevenLabsVoice,
        openaiVoice: args.openaiVoice,
        speed: args.speed,
        backgroundMusicPath: args.backgroundMusicPath,
        backgroundMusicVolume: args.backgroundMusicVolume,
      });

      return jsonResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`create_narrated_video failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },
};
