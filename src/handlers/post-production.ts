/**
 * Post-production tool handlers
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import {
  addBackgroundMusic,
  concatenateVideos,
  generateIntro,
  convertToSocialFormat,
  convertToAllFormats,
  addTextOverlays,
} from '../tools/index.js';
import type {
  AddMusicConfig,
  ConcatClip,
  TransitionType,
  SocialFormat,
  CropStrategy,
  TextOverlay,
} from '../tools/index.js';
import * as path from 'path';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || './output';

export const postProductionHandlers: Record<string, ToolHandler> = {

  add_background_music: async (args) => {
    try {
      const config: AddMusicConfig = {
        videoPath: args.videoPath,
        musicPath: args.musicPath,
        outputPath: args.outputPath ?? addSuffix(args.videoPath, '-music'),
        musicVolume: args.musicVolume ?? 0.25,
        fadeInDuration: args.fadeInDuration ?? 2,
        fadeOutDuration: args.fadeOutDuration ?? 3,
        loopMusic: args.loopMusic ?? true,
      };
      const result = await addBackgroundMusic(config);
      return jsonResponse({ success: true, outputPath: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`add_background_music failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  concatenate_videos: async (args) => {
    try {
      const result = await concatenateVideos({
        clips: args.clips as ConcatClip[],
        outputPath: args.outputPath,
        transition: (args.transition as TransitionType) ?? 'fade',
        transitionDuration: args.transitionDuration ?? 1,
      });
      return jsonResponse({ success: true, outputPath: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`concatenate_videos failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  generate_intro: async (args) => {
    try {
      const result = await generateIntro({
        text: args.text,
        subtitle: args.subtitle,
        duration: args.duration ?? 3,
        backgroundColor: args.backgroundColor ?? '#0a0a0a',
        textColor: args.textColor ?? 'white',
        outputPath: args.outputPath,
      });
      return jsonResponse({ success: true, outputPath: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`generate_intro failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  convert_social_format: async (args) => {
    try {
      const result = await convertToSocialFormat({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        format: args.format as SocialFormat,
        strategy: (args.strategy as CropStrategy) ?? 'blur-background',
      });
      return jsonResponse({ success: true, outputPath: result, format: args.format });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`convert_social_format failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  convert_all_social_formats: async (args) => {
    try {
      const formats = args.formats as SocialFormat[] | undefined;
      const result = await convertToAllFormats(
        args.inputPath,
        args.outputDir ?? OUTPUT_DIR,
        formats ?? ['instagram-reel', 'instagram-feed', 'youtube', 'tiktok'],
        (args.strategy as CropStrategy) ?? 'blur-background',
      );
      return jsonResponse({ success: true, files: result, totalFormats: Object.keys(result).length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`convert_all_social_formats failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  add_text_overlay: async (args) => {
    try {
      const result = await addTextOverlays(
        args.inputPath,
        args.outputPath,
        args.overlays as TextOverlay[],
      );
      return jsonResponse({ success: true, outputPath: result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`add_text_overlay failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },
};

function addSuffix(filePath: string, suffix: string): string {
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length);
  return `${base}${suffix}${ext}`;
}
