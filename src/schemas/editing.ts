/**
 * MCP Tool Schemas for Video Editing features
 * Speed, Color Grading, Effects, Crop, Reverse, Extract Audio,
 * Subtitles, Auto Captions, Keyframe Animation, PiP, Audio Ducking
 */

export const editingSchemas = [
  // --- 1. Video Speed ---
  {
    name: 'adjust_video_speed',
    description: 'Change video playback speed. Create slow-motion (0.25x-0.9x), timelapse (1.1x-4.0x), or any speed between. Audio pitch is automatically adjusted to match. Output: MP4.',
    annotations: {
      title: 'Adjust Video Speed',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path for the speed-adjusted video',
        },
        speed: {
          type: 'number',
          description: 'Speed factor: 0.25 (4x slow-mo) to 4.0 (4x faster). 1.0 = original speed. Common: 0.5 = half speed, 2.0 = double speed.',
        },
        audioMode: {
          type: 'string',
          enum: ['match', 'mute', 'original'],
          description: 'Audio handling: "match" adjusts pitch to speed (default), "mute" removes audio, "original" keeps audio unchanged (may desync).',
        },
      },
      required: ['inputPath', 'outputPath', 'speed'],
    },
  },

  // --- 2. Color Grading ---
  {
    name: 'apply_color_grade',
    description: 'Apply professional color grading to a video. Adjust brightness, contrast, saturation, gamma, and color temperature. Can create cinematic looks: warm sunset (temperature: 0.5, saturation: 1.3), cold thriller (temperature: -0.5, contrast: 1.4), desaturated documentary (saturation: 0.6). Output: MP4.',
    annotations: {
      title: 'Apply Color Grade',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        brightness: {
          type: 'number',
          description: 'Brightness: -1.0 (dark) to 1.0 (bright). 0 = no change. Default: 0.',
        },
        contrast: {
          type: 'number',
          description: 'Contrast: 0.0 (flat) to 3.0 (extreme). 1.0 = no change. Default: 1.0.',
        },
        saturation: {
          type: 'number',
          description: 'Saturation: 0.0 (grayscale) to 3.0 (vivid). 1.0 = no change. Default: 1.0.',
        },
        gamma: {
          type: 'number',
          description: 'Gamma: 0.1 to 10.0. < 1 = brighter midtones, > 1 = darker midtones. 1.0 = no change.',
        },
        temperature: {
          type: 'number',
          description: 'Color temperature: -1.0 (cool/blue) to 1.0 (warm/orange). 0 = neutral. Positive = golden hour, negative = moonlight.',
        },
      },
      required: ['inputPath', 'outputPath'],
    },
  },

  // --- 3. Video Effects ---
  {
    name: 'apply_video_effect',
    description: 'Apply a visual effect to a video. Available: blur (background/dream), sharpen (crisp detail), vignette (dark edges/cinematic), grayscale (B&W), sepia (vintage warm), noise (film grain), glow (soft bloom). Intensity 0-1. Output: MP4.',
    annotations: {
      title: 'Apply Video Effect',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        effect: {
          type: 'string',
          enum: ['blur', 'sharpen', 'vignette', 'grayscale', 'sepia', 'noise', 'glow'],
          description: 'Effect to apply: blur (dreamy), sharpen (crisp), vignette (dark edges), grayscale (B&W), sepia (vintage), noise (film grain), glow (soft bloom).',
        },
        intensity: {
          type: 'number',
          description: 'Effect intensity 0.0 (subtle) to 1.0 (maximum). Default: 0.5.',
        },
      },
      required: ['inputPath', 'outputPath', 'effect'],
    },
  },

  // --- 4. Crop Video ---
  {
    name: 'crop_video',
    description: 'Crop a video to a specific region. Specify width, height, and optional x/y offset. Use "center" for x/y to center the crop. Useful for removing borders, focusing on a UI element, or changing aspect ratio. Output: MP4.',
    annotations: {
      title: 'Crop Video',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        width: {
          type: 'number',
          description: 'Width of crop region in pixels',
        },
        height: {
          type: 'number',
          description: 'Height of crop region in pixels',
        },
        x: {
          type: ['number', 'string'],
          description: 'X offset in pixels, or "center" (default: center)',
        },
        y: {
          type: ['number', 'string'],
          description: 'Y offset in pixels, or "center" (default: center)',
        },
      },
      required: ['inputPath', 'outputPath', 'width', 'height'],
    },
  },

  // --- 5. Reverse Clip ---
  {
    name: 'reverse_clip',
    description: 'Reverse a video clip (play backwards). Optionally also reverse audio. Great for creative reveals, boomerang effects, or dramatic endings. Output: MP4.',
    annotations: {
      title: 'Reverse Video Clip',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        reverseAudio: {
          type: 'boolean',
          description: 'Also reverse audio track (default: true)',
        },
      },
      required: ['inputPath', 'outputPath'],
    },
  },

  // --- 6. Extract Audio ---
  {
    name: 'extract_audio',
    description: 'Extract the audio track from a video. Supports MP3, AAC, WAV, FLAC output. No video re-encoding needed — fast operation. Output: audio file.',
    annotations: {
      title: 'Extract Audio from Video',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output audio file path (e.g., ./output/audio.mp3)',
        },
        format: {
          type: 'string',
          enum: ['mp3', 'aac', 'wav', 'flac'],
          description: 'Audio format (default: mp3). mp3/aac for small files, wav/flac for lossless.',
        },
        bitrate: {
          type: 'string',
          description: 'Bitrate for lossy formats (default: 192k). Higher = better quality.',
        },
      },
      required: ['inputPath', 'outputPath'],
    },
  },

  // --- 7. Burn Subtitles ---
  {
    name: 'burn_subtitles',
    description: 'Burn (hardcode) subtitles from an SRT or ASS file directly into a video. Subtitles become part of the video pixels — visible on any player without subtitle support. Customize font size, color, outline, and position. Output: MP4.',
    annotations: {
      title: 'Burn Subtitles into Video',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        subtitlePath: {
          type: 'string',
          description: 'Path to SRT or ASS subtitle file',
        },
        fontSize: {
          type: 'number',
          description: 'Font size (default: 24)',
        },
        fontColor: {
          type: 'string',
          description: 'Font color in ASS hex format (default: &Hffffff = white)',
        },
        outlineColor: {
          type: 'string',
          description: 'Outline color (default: &H000000 = black)',
        },
        outlineWidth: {
          type: 'number',
          description: 'Outline width in pixels (default: 2)',
        },
        position: {
          type: 'string',
          enum: ['bottom', 'top', 'center'],
          description: 'Caption position (default: bottom)',
        },
      },
      required: ['inputPath', 'outputPath', 'subtitlePath'],
    },
  },

  // --- 8. Auto Caption ---
  {
    name: 'auto_caption',
    description: 'Automatically generate captions from speech using OpenAI Whisper, then burn them into the video. Supports 50+ languages with auto-detection. Three steps: extract audio → transcribe → burn subtitles. Also produces an SRT file. Requires OPENAI_API_KEY. Output: MP4 with captions + SRT file.',
    annotations: {
      title: 'Auto-Caption Video (Whisper AI)',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        inputPath: {
          type: 'string',
          description: 'Path to the input video with speech',
        },
        outputPath: {
          type: 'string',
          description: 'Output path for captioned video',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., "en", "de", "es", "fr", "ja"). Default: auto-detect.',
        },
        fontSize: {
          type: 'number',
          description: 'Caption font size (default: 28). Larger for stories/reels.',
        },
        position: {
          type: 'string',
          enum: ['bottom', 'top', 'center'],
          description: 'Caption position (default: bottom)',
        },
        keepSrt: {
          type: 'boolean',
          description: 'Keep the generated SRT file alongside the video (default: true)',
        },
      },
      required: ['inputPath', 'outputPath'],
    },
  },

  // --- 9. Keyframe Animation ---
  {
    name: 'add_keyframe_animation',
    description: 'Apply cinematic keyframe animation to a video: zoom, pan, and combinations. Define keyframes at specific times and the video smoothly interpolates between them. Perfect for Ken Burns effect on photos, dramatic zooms into UI elements, or slow pans across landscapes. Output: MP4.',
    annotations: {
      title: 'Add Keyframe Animation (Zoom/Pan)',
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
          description: 'Path to the input video or image',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        keyframes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number', description: 'Time in seconds for this keyframe' },
              scale: { type: 'number', description: 'Zoom: 1.0 = original, 2.0 = 2x zoom in. Default: 1.0' },
              panX: { type: 'number', description: 'Horizontal pan in pixels (0 = center). Positive = right.' },
              panY: { type: 'number', description: 'Vertical pan in pixels (0 = center). Positive = down.' },
            },
            required: ['time'],
          },
          description: 'Array of keyframes. Minimum 2. Video interpolates smoothly between them.',
        },
        outputWidth: {
          type: 'number',
          description: 'Output width (default: source width)',
        },
        outputHeight: {
          type: 'number',
          description: 'Output height (default: source height)',
        },
      },
      required: ['inputPath', 'outputPath', 'keyframes'],
    },
  },

  // --- 10. Picture-in-Picture ---
  {
    name: 'compose_picture_in_pip',
    description: 'Overlay a smaller video on top of a main video (Picture-in-Picture). Great for tutorials (webcam + screen), reactions (face + content), or commentary. Customize position, size, timing, and border. Output: MP4.',
    annotations: {
      title: 'Picture-in-Picture Composition',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        mainVideo: {
          type: 'string',
          description: 'Path to the main (background) video',
        },
        overlayVideo: {
          type: 'string',
          description: 'Path to the overlay (PiP) video — shown smaller on top',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        position: {
          type: 'string',
          enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
          description: 'Position of PiP overlay (default: bottom-right)',
        },
        scale: {
          type: 'number',
          description: 'Size of PiP relative to main video width: 0.1 (tiny) to 0.5 (half). Default: 0.3.',
        },
        startTime: {
          type: 'number',
          description: 'When PiP appears (seconds from start). Default: 0.',
        },
        endTime: {
          type: 'number',
          description: 'When PiP disappears (seconds). Default: end of main video.',
        },
        borderWidth: {
          type: 'number',
          description: 'Border around PiP in pixels (default: 0 = no border)',
        },
        borderColor: {
          type: 'string',
          description: 'Border color (default: white)',
        },
      },
      required: ['mainVideo', 'overlayVideo', 'outputPath'],
    },
  },

  // --- 11. Audio Ducking ---
  {
    name: 'add_audio_ducking',
    description: 'Apply audio ducking — automatically reduce volume during loud sections (like reducing background music when speech is detected). Uses dynamic range compression. Output: MP4.',
    annotations: {
      title: 'Audio Ducking',
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
          description: 'Path to the input video',
        },
        outputPath: {
          type: 'string',
          description: 'Output path',
        },
        duckLevel: {
          type: 'number',
          description: 'How much to reduce volume: 0.0 (silent) to 1.0 (no reduction). Default: 0.3 (reduce to 30%).',
        },
        attack: {
          type: 'number',
          description: 'Attack time in seconds — how fast ducking kicks in (default: 0.5)',
        },
        release: {
          type: 'number',
          description: 'Release time in seconds — how fast volume recovers (default: 1.0)',
        },
      },
      required: ['inputPath', 'outputPath'],
    },
  },
];
