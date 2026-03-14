/**
 * CapCut-tier tool handlers — LUT Presets, Voice Effects, Chroma Key,
 * Beat-Sync, Text Animations, Audio Mixer, Templates
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import { applyLutPreset, listLutPresets } from '../tools/engine/lut-presets.js';
import { applyVoiceEffect } from '../tools/engine/voice-effects.js';
import { applyChromaKey } from '../tools/engine/chroma-key.js';
import { syncToBeats } from '../tools/engine/beat-sync.js';
import { animateText } from '../tools/engine/text-animations.js';
import { mixAudioTracks } from '../tools/engine/audio-mixer.js';
import { getTemplateSummaries, getTemplate } from '../tools/engine/templates.js';
import { renderTemplate } from '../tools/engine/template-renderer.js';
import type { LutPreset } from '../tools/engine/lut-presets.js';
import type { VoiceEffect } from '../tools/engine/voice-effects.js';
import type { TextAnimation, TextPosition } from '../tools/engine/text-animations.js';
import type { AudioTrack } from '../tools/engine/audio-mixer.js';
import type { TemplateCategory } from '../tools/engine/templates.js';

export const capcutHandlers: Record<string, ToolHandler> = {

  apply_lut_preset: async (args) => {
    try {
      const result = await applyLutPreset({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        preset: args.preset as LutPreset,
        intensity: args.intensity ?? 1.0,
      });

      const presets = listLutPresets();
      const presetInfo = presets.find(p => p.name === args.preset);

      return jsonResponse({
        success: true,
        outputPath: result,
        preset: args.preset,
        intensity: args.intensity ?? 1.0,
        description: presetInfo?.description ?? '',
        message: `Applied "${args.preset}" color grade (intensity: ${args.intensity ?? 1.0}).`,
        availablePresets: presets.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`apply_lut_preset failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  apply_voice_effect: async (args) => {
    try {
      const result = await applyVoiceEffect({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        effect: args.effect as VoiceEffect,
        intensity: args.intensity ?? 0.5,
      });

      return jsonResponse({
        success: true,
        outputPath: result,
        effect: args.effect,
        intensity: args.intensity ?? 0.5,
        message: `Applied "${args.effect}" voice effect (intensity: ${args.intensity ?? 0.5}).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`apply_voice_effect failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  apply_chroma_key: async (args) => {
    try {
      const result = await applyChromaKey({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        background: args.background,
        keyColor: args.keyColor ?? '00FF00',
        similarity: args.similarity ?? 0.15,
        blend: args.blend ?? 0.02,
        despill: args.despill ?? true,
        useColorkey: args.useColorkey ?? false,
      });

      return jsonResponse({
        success: true,
        outputPath: result,
        keyColor: args.keyColor ?? '00FF00',
        similarity: args.similarity ?? 0.15,
        blend: args.blend ?? 0.02,
        despill: args.despill ?? true,
        mode: args.useColorkey ? 'colorkey (RGB)' : 'chromakey (YUV)',
        message: `Chroma key applied — background replaced. Key color: #${args.keyColor ?? '00FF00'}.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`apply_chroma_key failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  sync_to_beat: async (args) => {
    try {
      const result = await syncToBeats({
        audioPath: args.audioPath,
        clips: args.clips as string[],
        outputPath: args.outputPath,
        beatEffect: args.beatEffect ?? 'cut',
        sensitivity: args.sensitivity ?? 0.6,
        minBeatInterval: args.minBeatInterval ?? 0.3,
        maxBeats: args.maxBeats ?? 50,
      });

      return jsonResponse({
        success: true,
        outputPath: result.outputPath,
        beatsDetected: result.beatsDetected,
        beatsUsed: result.beatsUsed,
        duration: result.duration,
        beatPositions: result.beatPositions.slice(0, 20), // First 20 for readability
        message: `Beat-synced video: ${result.beatsUsed} cuts synced to ${result.beatsDetected} detected beats (${result.duration.toFixed(1)}s).`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`sync_to_beat failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  animate_text: async (args) => {
    try {
      const result = await animateText({
        inputPath: args.inputPath,
        outputPath: args.outputPath,
        text: args.text,
        animation: args.animation as TextAnimation,
        startTime: args.startTime ?? 0,
        duration: args.duration ?? 3,
        fontSize: args.fontSize ?? 48,
        fontColor: args.fontColor ?? 'FFFFFF',
        position: (args.position as TextPosition) ?? 'center',
        shadow: args.shadow ?? true,
      });

      return jsonResponse({
        success: true,
        outputPath: result,
        animation: args.animation,
        text: args.text,
        startTime: args.startTime ?? 0,
        duration: args.duration ?? 3,
        message: `Animated text "${(args.text as string).substring(0, 30)}..." with ${args.animation} effect.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`animate_text failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  mix_audio_tracks: async (args) => {
    try {
      const result = await mixAudioTracks({
        tracks: args.tracks as AudioTrack[],
        outputPath: args.outputPath,
        autoDuck: args.autoDuck ?? false,
        duckLevel: args.duckLevel ?? 0.2,
        format: args.format ?? 'aac',
        duration: args.duration,
      });

      return jsonResponse({
        success: true,
        outputPath: result.outputPath,
        trackCount: result.trackCount,
        ducking: result.ducking,
        format: args.format ?? 'aac',
        message: `Mixed ${result.trackCount} audio tracks${result.ducking ? ' with auto-ducking' : ''}.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`mix_audio_tracks failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  list_video_templates: async (args) => {
    try {
      const category = args.category as TemplateCategory | undefined;
      const summaries = getTemplateSummaries(category);

      return jsonResponse({
        success: true,
        templates: summaries,
        count: summaries.length,
        categories: ['social-reel', 'product-demo', 'testimonial', 'before-after', 'slideshow', 'tutorial', 'announcement', 'promo'],
        message: `Found ${summaries.length} templates${category ? ` in category "${category}"` : ''}.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`list_video_templates failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },

  render_template: async (args) => {
    try {
      const result = await renderTemplate({
        templateId: args.templateId,
        outputPath: args.outputPath,
        assets: {
          clips: args.clips as Record<string, string>,
          texts: args.texts as Record<string, string> | undefined,
          musicPath: args.musicPath as string | undefined,
          musicVolume: args.musicVolume as number | undefined,
        },
        colorGrade: args.colorGrade as string | undefined,
        socialFormats: args.socialFormats ?? false,
      });

      // Get template details for the response
      const template = getTemplate(args.templateId);

      return jsonResponse({
        success: true,
        outputPath: result.outputPath,
        template: result.template,
        templateName: template?.name ?? result.template,
        duration: `${result.duration}s`,
        resolution: `${result.resolution.width}x${result.resolution.height}`,
        clipsUsed: result.clipsUsed,
        textsApplied: result.textsApplied,
        socialVariants: result.socialVariants,
        message: `Rendered "${template?.name ?? result.template}": ${result.clipsUsed} clips, ${result.textsApplied} text animations, ${result.duration}s.`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`render_template failed: ${msg}`);
      return jsonResponse({ success: false, error: msg }, true);
    }
  },
};
