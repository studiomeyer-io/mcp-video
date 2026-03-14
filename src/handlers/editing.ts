/**
 * Editing tool handlers — speed, color, effects, crop, reverse, extract,
 * subtitles, auto captions, keyframes, PiP, audio ducking
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import {
  adjustVideoSpeed,
  applyColorGrade,
  applyVideoEffect,
  cropVideo,
  reverseClip,
  extractAudio,
  burnSubtitles,
  autoCaption,
  addKeyframeAnimation,
  composePip,
  addAudioDucking,
} from '../tools/index.js';
import type {
  VideoEffect,
  PipPosition,
  Keyframe,
} from '../tools/index.js';

export const editingHandlers: Record<string, ToolHandler> = {

  adjust_video_speed: async (args) => {
    try {
      const result = await adjustVideoSpeed({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        speed: args.speed,
        audioMode: args.audioMode ?? 'match',
      });
      return jsonResponse({
        success: true, outputPath: result, speed: args.speed,
        message: `Video speed changed to ${args.speed}x. Audio ${args.audioMode ?? 'match'}ed.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`adjust_video_speed failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  apply_color_grade: async (args) => {
    try {
      const result = await applyColorGrade({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        brightness: args.brightness,
        contrast: args.contrast,
        saturation: args.saturation,
        gamma: args.gamma,
        temperature: args.temperature,
      });
      const params = ['brightness', 'contrast', 'saturation', 'gamma', 'temperature']
        .filter(p => args[p] !== undefined)
        .map(p => `${p}=${args[p]}`)
        .join(', ');
      return jsonResponse({ success: true, outputPath: result, applied: params || 'defaults' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`apply_color_grade failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  apply_video_effect: async (args) => {
    try {
      const result = await applyVideoEffect({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        effect: args.effect as VideoEffect,
        intensity: args.intensity ?? 0.5,
      });
      return jsonResponse({
        success: true, outputPath: result, effect: args.effect,
        intensity: args.intensity ?? 0.5,
        message: `Applied ${args.effect} effect (intensity: ${args.intensity ?? 0.5}).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`apply_video_effect failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  crop_video: async (args) => {
    try {
      const result = await cropVideo({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        width: args.width,
        height: args.height,
        x: args.x ?? 'center',
        y: args.y ?? 'center',
      });
      return jsonResponse({
        success: true, outputPath: result,
        crop: { width: args.width, height: args.height, x: args.x ?? 'center', y: args.y ?? 'center' },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`crop_video failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  reverse_clip: async (args) => {
    try {
      const result = await reverseClip({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        reverseAudio: args.reverseAudio ?? true,
      });
      return jsonResponse({
        success: true, outputPath: result,
        message: `Video reversed${(args.reverseAudio ?? true) ? ' (audio also reversed)' : ' (audio kept forward)'}.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`reverse_clip failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  extract_audio: async (args) => {
    try {
      const result = await extractAudio({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        format: args.format ?? 'mp3',
        bitrate: args.bitrate ?? '192k',
      });
      return jsonResponse({
        success: true, outputPath: result, format: args.format ?? 'mp3',
        message: `Audio extracted as ${args.format ?? 'mp3'} (${args.bitrate ?? '192k'}).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`extract_audio failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  burn_subtitles: async (args) => {
    try {
      const result = await burnSubtitles({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        subtitlePath: args.subtitlePath,
        fontSize: args.fontSize ?? 24,
        fontColor: args.fontColor ?? '&Hffffff',
        outlineColor: args.outlineColor ?? '&H000000',
        outlineWidth: args.outlineWidth ?? 2,
        position: args.position ?? 'bottom',
      });
      return jsonResponse({
        success: true, outputPath: result,
        message: `Subtitles burned into video (${args.position ?? 'bottom'}, size: ${args.fontSize ?? 24}).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`burn_subtitles failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  auto_caption: async (args) => {
    try {
      const result = await autoCaption({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        language: args.language,
        fontSize: args.fontSize ?? 28,
        position: args.position ?? 'bottom',
        keepSrt: args.keepSrt ?? true,
      });
      return jsonResponse({
        success: true,
        videoPath: result.videoPath,
        srtPath: result.srtPath,
        message: 'Video captioned with Whisper AI. SRT file also generated.',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`auto_caption failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  add_keyframe_animation: async (args) => {
    try {
      const result = await addKeyframeAnimation({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        keyframes: args.keyframes as Keyframe[],
        outputWidth: args.outputWidth,
        outputHeight: args.outputHeight,
      });
      return jsonResponse({
        success: true,
        outputPath: result,
        keyframeCount: (args.keyframes as Keyframe[]).length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`add_keyframe_animation failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  compose_picture_in_pip: async (args) => {
    try {
      const result = await composePip({
        mainVideo: args.mainVideo,
        overlayVideo: args.overlayVideo,
        outputPath: args.outputPath,
        position: (args.position as PipPosition) ?? 'bottom-right',
        scale: args.scale ?? 0.3,
        startTime: args.startTime ?? 0,
        endTime: args.endTime,
        borderWidth: args.borderWidth ?? 0,
        borderColor: args.borderColor ?? 'white',
      });
      return jsonResponse({
        success: true, outputPath: result,
        pip: { position: args.position ?? 'bottom-right', scale: args.scale ?? 0.3 },
        message: `PiP composed: overlay at ${args.position ?? 'bottom-right'} (${Math.round((args.scale ?? 0.3) * 100)}% size).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`compose_picture_in_pip failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  add_audio_ducking: async (args) => {
    try {
      const result = await addAudioDucking({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        duckLevel: args.duckLevel ?? 0.3,
        attack: args.attack ?? 0.5,
        release: args.release ?? 1.0,
      });
      return jsonResponse({
        success: true, outputPath: result,
        message: `Audio ducking applied (reduce to ${Math.round((args.duckLevel ?? 0.3) * 100)}% volume).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`add_audio_ducking failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },
};
