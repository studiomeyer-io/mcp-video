/**
 * MCP Tool Schemas for Cinema Video Engine
 */

const sceneSchema = {
  type: 'object' as const,
  properties: {
    type: {
      type: 'string',
      enum: ['scroll', 'pause', 'hover', 'click', 'type', 'wait'],
      description: 'Scene type',
    },
    to: {
      type: ['string', 'number'],
      description: '[scroll] Target: "bottom", "top", pixel number, or CSS selector',
    },
    duration: {
      type: 'number',
      description: '[scroll/pause/hover] Duration in seconds',
    },
    easing: {
      type: 'string',
      enum: [
        'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
        'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
        'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
        'easeInQuint', 'easeOutQuint', 'easeInOutQuint',
        'easeInOutSine', 'cinematic', 'showcase',
      ],
      description: '[scroll] Easing curve (default: easeInOutCubic). "showcase" = dramatic slow start/end, "cinematic" = cruise-style',
    },
    selector: {
      type: 'string',
      description: '[hover/click/type/wait] CSS selector',
    },
    text: {
      type: 'string',
      description: '[type] Text to type',
    },
    delay: {
      type: 'number',
      description: '[type] Delay between keystrokes in ms (default: 80)',
    },
    waitFor: {
      type: ['string', 'number'],
      description: '[click] Wait strategy: "networkidle", "load", or milliseconds',
    },
    pauseAfter: {
      type: 'number',
      description: '[click] Pause after click in seconds (default: 1)',
    },
    animateCursor: {
      type: 'boolean',
      description: '[hover] Animate cursor movement (default: true)',
    },
    timeout: {
      type: 'number',
      description: '[wait] Max wait time in ms (default: 5000)',
    },
  },
  required: ['type'],
};

export const videoSchemas = [
  {
    name: 'record_website_video',
    description: `Record a cinema-quality video of a website with buttery-smooth 60fps scrolling. Uses frame-by-frame capture (not real-time screen recording) for perfect quality with zero frame drops. Supports custom scenes (scroll, hover, click, pause), multiple viewports (desktop/mobile/4K), cinematic easing curves, and visible cursor simulation. Output: MP4 + thumbnail PNG. Output directory: ./output/ (configurable via VIDEO_OUTPUT_DIR env var).`,
    annotations: {
      title: 'Record Website Video',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website to record',
        },
        outputPath: {
          type: 'string',
          description: 'Output file path without extension (default: ./output/website-video-{timestamp})',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'desktop-4k', 'tablet', 'tablet-landscape', 'mobile', 'mobile-landscape'],
          description: 'Viewport preset (default: desktop = 1920x1080)',
        },
        fps: {
          type: 'number',
          description: 'Frames per second (default: 60). Use 30 for smaller files.',
        },
        scenes: {
          type: 'array',
          items: sceneSchema,
          description: 'Array of scene definitions. If empty, does a default full-page scroll with pause at top/bottom.',
        },
        cursor: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: 'Show visible cursor (default: true)' },
            style: { type: 'string', enum: ['dot', 'arrow', 'pointer'], description: 'Cursor style (default: dot)' },
            color: { type: 'string', description: 'Cursor color (default: rgba(255,255,255,0.9))' },
            size: { type: 'number', description: 'Cursor size in px (default: 20)' },
          },
          description: 'Cursor configuration',
        },
        codec: {
          type: 'string',
          enum: ['h264', 'h265', 'vp9'],
          description: 'Video codec (default: h264). h265 = smaller files, vp9 = WebM format.',
        },
        quality: {
          type: 'number',
          description: 'CRF quality (0=lossless, 51=worst, default: 18). Lower = better quality, bigger file.',
        },
        darkMode: {
          type: 'boolean',
          description: 'Enable dark mode (default: false)',
        },
        preloadContent: {
          type: 'boolean',
          description: 'Pre-scroll to trigger lazy loading (default: true)',
        },
        dismissOverlays: {
          type: 'boolean',
          description: 'Auto-dismiss cookie banners and popups (default: true)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'record_website_scroll',
    description: 'Quick scroll-through video of a website. Simplified version of record_website_video — just provide URL and get a smooth 60fps scroll video. Perfect for quick portfolio showcases.',
    annotations: {
      title: 'Record Website Scroll',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website to record',
        },
        duration: {
          type: 'number',
          description: 'Scroll duration in seconds (default: 12)',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'desktop-4k', 'tablet', 'mobile'],
          description: 'Viewport preset (default: desktop)',
        },
        easing: {
          type: 'string',
          enum: ['easeInOutCubic', 'easeInOutQuint', 'easeInOutSine', 'cinematic', 'showcase'],
          description: 'Scroll easing curve (default: showcase)',
        },
        outputPath: {
          type: 'string',
          description: 'Output file path (default: ./output/scroll-{domain}-{timestamp})',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'record_multi_device',
    description: 'Record the same website in multiple viewports (desktop + tablet + mobile) in one go. Creates separate video files for each device. Great for responsive design showcases.',
    annotations: {
      title: 'Record Multi-Device Video',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website to record',
        },
        devices: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['desktop', 'desktop-4k', 'tablet', 'tablet-landscape', 'mobile', 'mobile-landscape'],
          },
          description: 'Device viewports to record (default: ["desktop", "tablet", "mobile"])',
        },
        duration: {
          type: 'number',
          description: 'Scroll duration per device in seconds (default: 10)',
        },
        outputDir: {
          type: 'string',
          description: 'Output directory (default: ./output/)',
        },
      },
      required: ['url'],
    },
  },
];
