/**
 * CapCut-tier tool schemas — Phase 1-3: LUT Presets, Voice Effects, Chroma Key,
 * Beat-Sync, Text Animations, Audio Mixer, Templates
 */

export const capcutSchemas = [
  // ─── apply_lut_preset ────────────────────────────────────────
  {
    name: 'apply_lut_preset',
    description: 'Apply a cinematic color grade preset to a video. 22 built-in presets from Hollywood blockbuster to vintage film, cyberpunk, noir, and more. Adjustable intensity for blending with original.',
    annotations: {
      title: 'Apply LUT Preset',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to the input video file',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the color-graded output video',
        },
        preset: {
          type: 'string',
          description: 'Color grade preset name',
          enum: [
            'cinematic-teal-orange',
            'cinematic-teal-orange-subtle',
            'vintage-film',
            'vintage-kodachrome',
            'cross-process',
            'moody-dark',
            'warm-golden',
            'cold-blue',
            'film-noir',
            'noir-blue-tint',
            'bleach-bypass',
            'cyberpunk-neon',
            'cyberpunk-teal-pink',
            'desaturated-fincher',
            'pastel-dream',
            'matrix-green',
            'sepia',
            'blockbuster-extreme',
            'muted-forest',
            'high-contrast-music',
            'faded-lofi',
            'sunset-magic-hour',
          ],
        },
        intensity: {
          type: 'number',
          description: 'Blend intensity: 0.0 (original) to 1.0 (full effect). Default: 1.0',
        },
      },
      required: ['inputPath', 'outputPath', 'preset'],
    },
  },

  // ─── apply_voice_effect ──────────────────────────────────────
  {
    name: 'apply_voice_effect',
    description: 'Apply a voice/audio effect to a video or audio file. 9 effects: echo, reverb, deep voice, chipmunk, robot, whisper, radio, megaphone, underwater. Video stream is preserved when processing video files.',
    annotations: {
      title: 'Apply Voice Effect',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to the input video or audio file',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the output file with voice effect applied',
        },
        effect: {
          type: 'string',
          description: 'Voice effect to apply',
          enum: [
            'echo',
            'reverb',
            'deep',
            'chipmunk',
            'robot',
            'whisper',
            'radio',
            'megaphone',
            'underwater',
          ],
        },
        intensity: {
          type: 'number',
          description: 'Effect intensity: 0.0 (subtle) to 1.0 (extreme). Default: 0.5',
        },
      },
      required: ['inputPath', 'outputPath', 'effect'],
    },
  },

  // ─── apply_chroma_key ────────────────────────────────────────
  {
    name: 'apply_chroma_key',
    description: 'Remove green/blue screen background and replace it with a video, image, or solid color. Supports chromakey (YUV, best for green/blue) and colorkey (RGB, any color). Includes despill for clean edges.',
    annotations: {
      title: 'Apply Chroma Key',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to the input video with green/blue screen',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the composited output video',
        },
        background: {
          type: 'string',
          description: 'Replacement background: path to a video file, image file, or hex color (e.g., "000000" for black, "FFFFFF" for white)',
        },
        keyColor: {
          type: 'string',
          description: 'Key color as 6-digit hex (e.g., "00FF00" for green, "0000FF" for blue). Default: "00FF00"',
        },
        similarity: {
          type: 'number',
          description: 'Color match tolerance: 0.01 (exact match only) to 1.0 (wide match). Default: 0.15',
        },
        blend: {
          type: 'number',
          description: 'Edge softness: 0.0 (hard edge) to 0.1 (soft edge). Keep low! Default: 0.02',
        },
        despill: {
          type: 'boolean',
          description: 'Remove green/blue color contamination on edges. Default: true',
        },
        useColorkey: {
          type: 'boolean',
          description: 'Use colorkey (RGB space) instead of chromakey (YUV space). Better for non-standard key colors. Default: false',
        },
      },
      required: ['inputPath', 'outputPath', 'background'],
    },
  },

  // ─── sync_to_beat ────────────────────────────────────────────
  {
    name: 'sync_to_beat',
    description: 'THE CapCut signature feature. Analyzes music/audio for beats, then automatically cuts and syncs video clips to the beat positions. Creates viral-style beat-synced montages. Optional beat effects: flash, zoom pulse.',
    annotations: {
      title: 'Beat-Sync Video',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        audioPath: {
          type: 'string',
          description: 'Path to the music/audio file to analyze for beats',
        },
        clips: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of video clip paths to cut and sync to beats (used in order, cycles if needed)',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the beat-synced output video',
        },
        beatEffect: {
          type: 'string',
          description: 'Effect on beat transitions: "cut" (hard cut), "flash" (white flash), "zoom" (quick zoom pulse). Default: "cut"',
          enum: ['cut', 'flash', 'zoom'],
        },
        sensitivity: {
          type: 'number',
          description: 'Beat detection sensitivity: 0.0 (detect fewer beats) to 1.0 (detect more beats). Default: 0.6',
        },
        minBeatInterval: {
          type: 'number',
          description: 'Minimum seconds between beats (filters false positives). Default: 0.3',
        },
        maxBeats: {
          type: 'number',
          description: 'Maximum number of beats to use (limits output length). Default: 50',
        },
      },
      required: ['audioPath', 'clips', 'outputPath'],
    },
  },

  // ─── animate_text ────────────────────────────────────────────
  {
    name: 'animate_text',
    description: 'Add animated text to a video. 15 animation styles: typewriter, pop, slide (up/down/left/right), bounce, fade (in/out/both), glitch, zoom-in, shake, neon-glow, wave. Configurable position, color, font size, timing.',
    annotations: {
      title: 'Animate Text',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to the input video file',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the output video with animated text',
        },
        text: {
          type: 'string',
          description: 'Text to animate',
        },
        animation: {
          type: 'string',
          description: 'Animation style',
          enum: [
            'typewriter', 'pop', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
            'bounce', 'fade-in', 'fade-out', 'fade-in-out', 'glitch', 'zoom-in',
            'shake', 'neon-glow', 'wave',
          ],
        },
        startTime: {
          type: 'number',
          description: 'When the text appears (seconds). Default: 0',
        },
        duration: {
          type: 'number',
          description: 'How long the text is visible (seconds). Default: 3',
        },
        fontSize: {
          type: 'number',
          description: 'Font size in pixels. Default: 48',
        },
        fontColor: {
          type: 'string',
          description: 'Font color as hex (e.g., "FFFFFF" for white, "FF0000" for red). Default: "FFFFFF"',
        },
        position: {
          type: 'string',
          description: 'Text position on screen. Default: "center"',
          enum: ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
        },
        shadow: {
          type: 'boolean',
          description: 'Add shadow/outline for readability. Default: true',
        },
      },
      required: ['inputPath', 'outputPath', 'text', 'animation'],
    },
  },

  // ─── mix_audio_tracks ────────────────────────────────────────
  {
    name: 'mix_audio_tracks',
    description: 'Mix multiple audio tracks together (voiceover + music + SFX). Supports auto-ducking: music volume automatically reduces when voice is active. Per-track volume, fade in/out, delay.',
    annotations: {
      title: 'Mix Audio Tracks',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        tracks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to audio or video file' },
              volume: { type: 'number', description: 'Volume: 0.0-2.0 (1.0 = original). Default: 1.0' },
              fadeIn: { type: 'number', description: 'Fade in duration in seconds. Default: 0' },
              fadeOut: { type: 'number', description: 'Fade out duration in seconds. Default: 0' },
              delay: { type: 'number', description: 'Start delay in seconds. Default: 0' },
              role: { type: 'string', enum: ['voice', 'music', 'sfx'], description: 'Track role for auto-ducking. "voice" triggers ducking on "music" tracks.' },
            },
            required: ['path'],
          },
          description: 'Array of audio tracks to mix (2-8 tracks)',
        },
        outputPath: {
          type: 'string',
          description: 'Path for the mixed audio output',
        },
        autoDuck: {
          type: 'boolean',
          description: 'Enable auto-ducking: music reduces when voice is active. Default: false',
        },
        duckLevel: {
          type: 'number',
          description: 'How much to reduce music during speech: 0.0-1.0 (0.2 = reduce to 20%). Default: 0.2',
        },
        format: {
          type: 'string',
          description: 'Output format. Default: "aac"',
          enum: ['mp3', 'aac', 'wav'],
        },
        duration: {
          type: 'number',
          description: 'Output duration in seconds. Omit to use longest track.',
        },
      },
      required: ['tracks', 'outputPath'],
    },
  },

  // ─── list_video_templates ────────────────────────────────────
  {
    name: 'list_video_templates',
    description: 'List available video templates with their details. 9 templates across 8 categories: social-reel, product-demo, testimonial, before-after, slideshow, tutorial, announcement, promo. Each template defines clip slots, text placeholders, transitions, and recommended color grades.',
    annotations: {
      title: 'List Video Templates',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category. Omit to list all templates.',
          enum: ['social-reel', 'product-demo', 'testimonial', 'before-after', 'slideshow', 'tutorial', 'announcement', 'promo'],
        },
      },
      required: [],
    },
  },

  // ─── render_template ─────────────────────────────────────────
  {
    name: 'render_template',
    description: 'Render a video template with user-provided assets. Provide clips for each slot, customize text placeholders, add music. The pipeline: trim clips → color grade → text animations → concatenate → add music → export. Produces professional video from templates.',
    annotations: {
      title: 'Render Video Template',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        templateId: {
          type: 'string',
          description: 'Template ID (use list_video_templates to see available templates)',
          enum: [
            'social-reel-hype',
            'social-reel-aesthetic',
            'product-demo-saas',
            'testimonial-single',
            'before-after-split',
            'slideshow-photo',
            'tutorial-howto',
            'announcement-launch',
            'promo-sale',
          ],
        },
        outputPath: {
          type: 'string',
          description: 'Path for the rendered video output',
        },
        clips: {
          type: 'object',
          description: 'Map of slot name → file path. Use list_video_templates to see required slots for each template.',
        },
        texts: {
          type: 'object',
          description: 'Map of placeholder name → custom text. Overrides default template texts.',
        },
        musicPath: {
          type: 'string',
          description: 'Path to background music file (optional)',
        },
        musicVolume: {
          type: 'number',
          description: 'Music volume: 0.0-1.0. Default: 0.3',
        },
        colorGrade: {
          type: 'string',
          description: 'Override color grade preset. Omit to use template default.',
        },
        socialFormats: {
          type: 'boolean',
          description: 'Also export social format variants (Instagram Reel, TikTok, YouTube Short). Default: false',
        },
      },
      required: ['templateId', 'outputPath', 'clips'],
    },
  },
];
