#!/usr/bin/env node
/**
 * Video Production — MCP Server v1.0.0
 *
 * 8 consolidated tools (from 33+) for recording, editing, color grading,
 * audio, text, compositing, speech/narration, and smart screenshots.
 *
 * Port: 9847 (HTTP mode, configurable via MCP_PORT)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logger } from './lib/logger.js';
import { startDualTransport } from './lib/dual-transport.js';
import { videoHandlers } from './handlers/video.js';
import { editingHandlers } from './handlers/editing.js';
import { capcutHandlers } from './handlers/capcut.js';
import { postProductionHandlers } from './handlers/post-production.js';
import { ttsHandlers } from './handlers/tts.js';
import { smartScreenshotHandlers } from './handlers/smart-screenshot.js';

const SERVER_NAME = 'mcp-video';
const SERVER_VERSION = '1.0.0';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ALL_HANDLERS: Record<string, (a: any) => any> = {
  ...videoHandlers,
  ...editingHandlers,
  ...capcutHandlers,
  ...postProductionHandlers,
  ...ttsHandlers,
  ...smartScreenshotHandlers,
};

/** Delegate to existing handler by original tool name, fix content type literals */
async function delegate(name: string, args: Record<string, unknown>) {
  const handler = ALL_HANDLERS[name];
  if (!handler) throw new Error(`Unknown handler: ${name}`);
  const result = await handler(args);
  // Ensure content items have literal 'text' type for MCP SDK
  if (result?.content) {
    for (const item of result.content) {
      if (item.type === 'text') item.type = 'text' as const;
    }
  }
  return result;
}

export function createMcpServer() {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: `# Video Server — Tool Selection Guide

You have 8 tools for video production. Each has a \`type\` parameter to select the operation.

## Recording:
- **video_record** — Record websites: cinema (full control), scroll (quick scroll-through), multi-device (desktop+tablet+mobile)

## Editing:
- **video_edit** — Edit clips: speed (slow-mo/timelapse), crop, reverse, keyframe (zoom/pan), pip (picture-in-picture)
- **video_color** — Color & effects: grade (brightness/contrast/etc), effect (blur/sharpen/vignette/etc), lut (22 cinema presets), chroma (green screen)
- **video_audio** — Audio: extract, music (background), ducking (auto volume), mix (multi-track), voice (effects like echo/robot/whisper)
- **video_text** — Text & captions: subtitles (burn SRT), caption (Whisper AI auto-caption), overlay (animated text layers), animate (15 text animations)

## Post-Production:
- **video_compose** — Compose: concat (join clips), intro (animated intro/outro), social (format for Instagram/TikTok/etc), social-all (batch all platforms), beat-sync (cuts on music beats), templates (list), render (from template)

## Speech & AI:
- **video_speech** — TTS & narration: generate (ElevenLabs/OpenAI speech), voices (list available), narrated (full narrated video from script)

## Screenshots:
- **video_screenshot** — Smart screenshots: capture (element-aware), detect (page feature analysis)

## Decision Flow:
1. Record website? → video_record
2. Edit existing video? → video_edit
3. Color/effects? → video_color
4. Audio work? → video_audio
5. Text/captions? → video_text
6. Join clips/format? → video_compose
7. Need voiceover? → video_speech
8. Screenshots? → video_screenshot`,
    },
  );

  // ── 1. video_record ────────────────────────────────────
  server.registerTool(
    'video_record',
    {
      title: 'Record Website Video',
      description: 'Record website videos. Types: cinema (full 60fps with scenes/cursor), scroll (quick scroll-through), multi-device (desktop+tablet+mobile).',
      inputSchema: z.object({
        type: z.enum(['cinema', 'scroll', 'multi-device']).describe('Recording type'),
        url: z.string().min(1).describe('Website URL'),
      }).passthrough(),
      annotations: { title: 'Record Video', readOnlyHint: false, openWorldHint: true },
    },
    async (args) => {
      const { type, ...rest } = args;
      const handlerName = type === 'cinema' ? 'record_website_video'
        : type === 'scroll' ? 'record_website_scroll'
        : 'record_multi_device';
      return await delegate(handlerName, rest);
    },
  );

  // ── 2. video_edit ──────────────────────────────────────
  server.registerTool(
    'video_edit',
    {
      title: 'Edit Video',
      description: 'Edit video clips. Types: speed (0.25x-4x), crop (region), reverse (± audio), keyframe (zoom/pan animation), pip (picture-in-picture overlay).',
      inputSchema: z.object({
        type: z.enum(['speed', 'crop', 'reverse', 'keyframe', 'pip']).describe('Edit operation'),
      }).passthrough(),
      annotations: { title: 'Edit Video', readOnlyHint: false },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        speed: 'adjust_video_speed', crop: 'crop_video', reverse: 'reverse_clip',
        keyframe: 'add_keyframe_animation', pip: 'compose_picture_in_pip',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 3. video_color ─────────────────────────────────────
  server.registerTool(
    'video_color',
    {
      title: 'Color & Effects',
      description: 'Color grading & visual effects. Types: grade (brightness/contrast/saturation/gamma/temperature), effect (blur/sharpen/vignette/grayscale/sepia/noise/glow), lut (22 cinema presets), chroma (green/blue screen replacement).',
      inputSchema: z.object({
        type: z.enum(['grade', 'effect', 'lut', 'chroma']).describe('Color operation'),
      }).passthrough(),
      annotations: { title: 'Color & Effects', readOnlyHint: false },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        grade: 'apply_color_grade', effect: 'apply_video_effect',
        lut: 'apply_lut_preset', chroma: 'apply_chroma_key',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 4. video_audio ─────────────────────────────────────
  server.registerTool(
    'video_audio',
    {
      title: 'Audio Tools',
      description: 'Audio operations. Types: extract (MP3/AAC/WAV/FLAC from video), music (add background music with fade), ducking (auto volume reduction), mix (multi-track mixing), voice (9 voice effects: echo/reverb/deep/chipmunk/robot/whisper/radio/megaphone/underwater).',
      inputSchema: z.object({
        type: z.enum(['extract', 'music', 'ducking', 'mix', 'voice']).describe('Audio operation'),
      }).passthrough(),
      annotations: { title: 'Audio', readOnlyHint: false },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        extract: 'extract_audio', music: 'add_background_music',
        ducking: 'add_audio_ducking', mix: 'mix_audio_tracks', voice: 'apply_voice_effect',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 5. video_text ──────────────────────────────────────
  server.registerTool(
    'video_text',
    {
      title: 'Text & Captions',
      description: 'Text overlays & captions. Types: subtitles (burn SRT/ASS), caption (Whisper AI auto-caption), overlay (animated text layers), animate (15 text animation styles).',
      inputSchema: z.object({
        type: z.enum(['subtitles', 'caption', 'overlay', 'animate']).describe('Text operation'),
      }).passthrough(),
      annotations: { title: 'Text & Captions', readOnlyHint: false },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        subtitles: 'burn_subtitles', caption: 'auto_caption',
        overlay: 'add_text_overlay', animate: 'animate_text',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 6. video_compose ───────────────────────────────────
  server.registerTool(
    'video_compose',
    {
      title: 'Compose & Export',
      description: 'Compose and export videos. Types: concat (join clips with transitions), intro (animated intro/outro), social (convert to Instagram/TikTok/YouTube/LinkedIn), social-all (batch all platforms), beat-sync (cut on music beats), templates (list available), render (render from template).',
      inputSchema: z.object({
        type: z.enum(['concat', 'intro', 'social', 'social-all', 'beat-sync', 'templates', 'render']).describe('Compose operation'),
      }).passthrough(),
      annotations: { title: 'Compose & Export', readOnlyHint: false },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        concat: 'concatenate_videos', intro: 'generate_intro',
        social: 'convert_social_format', 'social-all': 'convert_all_social_formats',
        'beat-sync': 'sync_to_beat', templates: 'list_video_templates', render: 'render_template',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 7. video_speech ────────────────────────────────────
  server.registerTool(
    'video_speech',
    {
      title: 'Speech & Narration',
      description: 'Text-to-speech & narrated videos. Types: generate (ElevenLabs/OpenAI TTS), voices (list available voices), narrated (full narrated video: script → TTS → website recording → sync → MP4).',
      inputSchema: z.object({
        type: z.enum(['generate', 'voices', 'narrated']).describe('Speech operation'),
      }).passthrough(),
      annotations: { title: 'Speech & Narration', readOnlyHint: false, openWorldHint: true },
    },
    async (args) => {
      const { type, ...rest } = args;
      const map: Record<string, string> = {
        generate: 'generate_speech', voices: 'list_voices', narrated: 'create_narrated_video',
      };
      return await delegate(map[type], rest);
    },
  );

  // ── 8. video_screenshot ────────────────────────────────
  server.registerTool(
    'video_screenshot',
    {
      title: 'Smart Screenshot',
      description: 'Smart element-aware screenshots. Types: capture (detect & screenshot specific page features: chat, pricing, hero, etc.), detect (analyze page features without screenshotting).',
      inputSchema: z.object({
        type: z.enum(['capture', 'detect']).describe('Screenshot operation'),
        url: z.string().min(1).describe('Website URL'),
      }).passthrough(),
      annotations: { title: 'Smart Screenshot', readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      const { type, ...rest } = args;
      const handlerName = type === 'capture' ? 'screenshot_element' : 'detect_page_features';
      return await delegate(handlerName, rest);
    },
  );

  return server;
}

// ─── Startup Validation ──────────────────────────────────

import { execFileSync } from 'child_process';
import * as fs from 'fs';

function checkDependencies(): void {
  // execFileSync avoids shell interpolation even though `bin` is a hardcoded
  // literal today — keeps the defense-in-depth clear to future refactors.
  for (const bin of ['ffmpeg', 'ffprobe']) {
    try {
      execFileSync('which', [bin], { stdio: 'pipe' });
    } catch {
      logger.error(`${bin} not found. Install ffmpeg: https://ffmpeg.org/download.html`);
      process.exit(1);
    }
  }

  const outputDir = process.env.VIDEO_OUTPUT_DIR || './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`Created output directory: ${outputDir}`);
  }
}

// ─── Start ────────────────────────────────────────────────
checkDependencies();

startDualTransport(createMcpServer, {
  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  defaultPort: 9847,
}).then((result: { type: string; port?: number }) => {
  logger.info(`Video MCP Server running — 8 tools (${result.type}${result.port ? ` :${result.port}` : ''})`);
}).catch((error) => {
  logger.logError('Fatal error', error);
  process.exit(1);
});
