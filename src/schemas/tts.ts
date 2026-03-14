/**
 * MCP Tool Schemas for TTS & Narrated Video
 */

const sceneSchema = {
  type: 'object' as const,
  properties: {
    type: {
      type: 'string',
      enum: ['scroll', 'pause', 'hover', 'click', 'type', 'wait'],
    },
    to: { type: ['string', 'number'] },
    duration: { type: 'number' },
    easing: { type: 'string' },
    selector: { type: 'string' },
    text: { type: 'string' },
    waitFor: { type: ['string', 'number'] },
    pauseAfter: { type: 'number' },
  },
  required: ['type'],
};

export const ttsSchemas = [
  // --- Text-to-Speech ---
  {
    name: 'generate_speech',
    description: 'Generate speech audio from text using ElevenLabs (primary) or OpenAI TTS (fallback). Supports German, English, Spanish and 29+ languages. Returns an MP3 file. IMPORTANT: Uses paid APIs — ElevenLabs or OpenAI.',
    annotations: {
      title: 'Generate Speech (TTS)',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text to convert to speech',
        },
        outputPath: {
          type: 'string',
          description: 'Output path for MP3 file (default: ./output/speech-{timestamp}.mp3)',
        },
        provider: {
          type: 'string',
          enum: ['elevenlabs', 'openai'],
          description: 'TTS provider (default: elevenlabs if API key available, otherwise openai)',
        },
        language: {
          type: 'string',
          description: 'Language code: en, de, es, fr, it, etc. (default: en)',
        },
        speed: {
          type: 'number',
          description: 'Speaking speed 0.7-1.2 for ElevenLabs, 0.25-4.0 for OpenAI (default: 1.0)',
        },
        elevenLabsVoice: {
          type: 'string',
          enum: ['rachel', 'sarah', 'emily', 'charlotte', 'alice', 'matilda', 'lily', 'brian', 'adam', 'daniel', 'josh', 'james', 'liam', 'chris', 'george'],
          description: 'ElevenLabs voice (default: adam). Male: adam, brian, daniel, josh, james, liam. Female: rachel, sarah, emily, charlotte.',
        },
        elevenLabsModel: {
          type: 'string',
          enum: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
          description: 'ElevenLabs model (default: eleven_multilingual_v2 for best quality)',
        },
        openaiVoice: {
          type: 'string',
          enum: ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'],
          description: 'OpenAI voice (default: onyx). Deep: onyx, echo. Bright: nova, shimmer. Neutral: alloy.',
        },
        openaiModel: {
          type: 'string',
          enum: ['tts-1', 'tts-1-hd'],
          description: 'OpenAI model (default: tts-1-hd for best quality)',
        },
        stability: {
          type: 'number',
          description: 'ElevenLabs voice stability 0-1 (default: 0.5). Lower = more dynamic.',
        },
        similarityBoost: {
          type: 'number',
          description: 'ElevenLabs similarity 0-1 (default: 0.75).',
        },
      },
      required: ['text'],
    },
  },

  // --- List Voices ---
  {
    name: 'list_voices',
    description: 'List all available ElevenLabs voices including custom/cloned voices. Requires ELEVENLABS_API_KEY.',
    annotations: {
      title: 'List ElevenLabs Voices',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // --- Narrated Video (the killer feature) ---
  {
    name: 'create_narrated_video',
    description: `Create a fully narrated explainer video of a website or app. This is the ultimate tool: provide a URL and a script, and get a professional video with AI voiceover synchronized to the on-screen actions.

Flow: Script → TTS → Website Recording (synced to speech durations) → Merge video + audio → Final MP4

Each segment has text (what to say) and a scene (what to show). The scene duration is automatically matched to the speech duration.

IMPORTANT: Uses paid TTS APIs (ElevenLabs or OpenAI). Always confirm with user before calling.`,
    annotations: {
      title: 'Create Narrated Video',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website/app to record',
        },
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Narration text for this segment',
              },
              scene: sceneSchema,
              paddingAfter: {
                type: 'number',
                description: 'Extra pause after speech in seconds (default: 0.5)',
              },
            },
            required: ['text', 'scene'],
          },
          description: 'Array of narration segments, each with text + scene action',
        },
        outputPath: {
          type: 'string',
          description: 'Output path without extension (default: ./output/narrated-{domain})',
        },
        provider: {
          type: 'string',
          enum: ['elevenlabs', 'openai'],
          description: 'TTS provider (default: elevenlabs)',
        },
        language: {
          type: 'string',
          description: 'Language code (default: en)',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'desktop-4k', 'tablet', 'mobile'],
          description: 'Viewport (default: desktop)',
        },
        elevenLabsVoice: {
          type: 'string',
          enum: ['rachel', 'sarah', 'emily', 'charlotte', 'alice', 'matilda', 'lily', 'brian', 'adam', 'daniel', 'josh', 'james', 'liam', 'chris', 'george'],
          description: 'ElevenLabs voice (default: adam)',
        },
        openaiVoice: {
          type: 'string',
          enum: ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'],
          description: 'OpenAI voice (default: onyx)',
        },
        speed: {
          type: 'number',
          description: 'Speaking speed (default: 1.0)',
        },
        backgroundMusicPath: {
          type: 'string',
          description: 'Optional: path to background music file',
        },
        backgroundMusicVolume: {
          type: 'number',
          description: 'Background music volume 0-1 (default: 0.1)',
        },
      },
      required: ['url', 'segments'],
    },
  },
];
