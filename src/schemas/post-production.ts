/**
 * MCP Tool Schemas for Post-Production features
 */

export const postProductionSchemas = [
  // --- Background Music ---
  {
    name: 'add_background_music',
    description: 'Add background music to a video. Supports fade in/out, volume control, and automatic looping. Does NOT re-encode the video (fast). Output: MP4 with AAC audio.',
    annotations: {
      title: 'Add Background Music',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        videoPath: {
          type: 'string',
          description: 'Path to the video file',
        },
        musicPath: {
          type: 'string',
          description: 'Path to the music file (mp3, wav, aac, ogg)',
        },
        outputPath: {
          type: 'string',
          description: 'Output path (default: adds -music suffix)',
        },
        musicVolume: {
          type: 'number',
          description: 'Music volume 0.0-1.0 (default: 0.25). Recommended: 0.15-0.3 for background.',
        },
        fadeInDuration: {
          type: 'number',
          description: 'Fade in duration in seconds (default: 2)',
        },
        fadeOutDuration: {
          type: 'number',
          description: 'Fade out duration in seconds (default: 3)',
        },
        loopMusic: {
          type: 'boolean',
          description: 'Loop music if shorter than video (default: true)',
        },
      },
      required: ['videoPath', 'musicPath'],
    },
  },

  // --- Concatenation ---
  {
    name: 'concatenate_videos',
    description: 'Concatenate multiple video clips into one with cinematic transitions. Automatically normalizes resolution and framerate. Supports 30+ transition types: fade, dissolve, wipeleft, slideright, circleopen, radial, etc.',
    annotations: {
      title: 'Concatenate Videos',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        clips: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to video clip' },
              trimStart: { type: 'number', description: 'Optional: start time in seconds' },
              trimEnd: { type: 'number', description: 'Optional: end time in seconds' },
            },
            required: ['path'],
          },
          description: 'Video clips in order',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        transition: {
          type: 'string',
          enum: [
            'fade', 'fadeblack', 'fadewhite', 'dissolve',
            'wipeleft', 'wiperight', 'wipeup', 'wipedown',
            'slideleft', 'slideright', 'slideup', 'slidedown',
            'smoothleft', 'smoothright', 'circleopen', 'circleclose',
            'radial', 'pixelize', 'diagtl', 'diagtr',
          ],
          description: 'Transition type between clips (default: fade)',
        },
        transitionDuration: {
          type: 'number',
          description: 'Transition duration in seconds (default: 1)',
        },
      },
      required: ['clips', 'outputPath'],
    },
  },

  // --- Intro/Outro Generator ---
  {
    name: 'generate_intro',
    description: 'Generate a cinematic intro or outro clip with animated text. Creates a solid-color background with fade-in title and optional subtitle. Perfect for branding.',
    annotations: {
      title: 'Generate Intro/Outro Clip',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Main title text',
        },
        subtitle: {
          type: 'string',
          description: 'Optional subtitle text',
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds (default: 3)',
        },
        backgroundColor: {
          type: 'string',
          description: 'Background color hex (default: #0a0a0a)',
        },
        textColor: {
          type: 'string',
          description: 'Text color (default: white)',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
      },
      required: ['text', 'outputPath'],
    },
  },

  // --- Social Media Format ---
  {
    name: 'convert_social_format',
    description: 'Convert a video to a specific social media format. Handles aspect ratio conversion with crop, padding, or blur-background strategy. Supports: instagram-reel, instagram-feed, youtube, youtube-short, tiktok, linkedin.',
    annotations: {
      title: 'Convert to Social Media Format',
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
          description: 'Path to input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        format: {
          type: 'string',
          enum: ['instagram-reel', 'instagram-feed', 'instagram-story', 'youtube', 'youtube-short', 'tiktok', 'linkedin-landscape', 'linkedin-square'],
          description: 'Target social media format',
        },
        strategy: {
          type: 'string',
          enum: ['crop', 'pad', 'blur-background'],
          description: 'How to handle aspect ratio: crop (cut edges), pad (black bars), blur-background (blurred fill). Default: blur-background.',
        },
      },
      required: ['inputPath', 'outputPath', 'format'],
    },
  },

  // --- Batch Social Format ---
  {
    name: 'convert_all_social_formats',
    description: 'Convert a video to multiple social media formats at once. Creates separate files for each platform. Great for preparing content for all channels simultaneously.',
    annotations: {
      title: 'Convert to All Social Formats',
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
          description: 'Path to input video',
        },
        outputDir: {
          type: 'string',
          description: 'Output directory (default: ./output/)',
        },
        formats: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['instagram-reel', 'instagram-feed', 'instagram-story', 'youtube', 'youtube-short', 'tiktok', 'linkedin-landscape', 'linkedin-square'],
          },
          description: 'Formats to generate (default: instagram-reel, instagram-feed, youtube, tiktok)',
        },
        strategy: {
          type: 'string',
          enum: ['crop', 'pad', 'blur-background'],
          description: 'Aspect ratio strategy (default: blur-background)',
        },
      },
      required: ['inputPath'],
    },
  },

  // --- Text Overlays ---
  {
    name: 'add_text_overlay',
    description: 'Add animated text overlays to a video. Supports fade-in/out, positioning (center, top, bottom, corners), background boxes, and multiple text layers.',
    annotations: {
      title: 'Add Text Overlay to Video',
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
          description: 'Path to input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        overlays: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to display' },
              position: {
                type: 'string',
                enum: ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
                description: 'Position (default: center)',
              },
              fontSize: { type: 'number', description: 'Font size (default: 48)' },
              fontColor: { type: 'string', description: 'Color (default: white)' },
              startTime: { type: 'number', description: 'Start time in seconds' },
              endTime: { type: 'number', description: 'End time in seconds' },
              fadeIn: { type: 'number', description: 'Fade in seconds (default: 0.5)' },
              fadeOut: { type: 'number', description: 'Fade out seconds (default: 0.5)' },
              showBackground: { type: 'boolean', description: 'Show background box (default: false)' },
            },
            required: ['text', 'startTime', 'endTime'],
          },
          description: 'Array of text overlays',
        },
      },
      required: ['inputPath', 'outputPath', 'overlays'],
    },
  },
];
