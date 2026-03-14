/**
 * MCP Tool Schema for Smart Screenshot Engine
 */

export const smartScreenshotSchemas = [
  {
    name: 'screenshot_element',
    description: `Smart element-aware screenshot tool. Automatically detects and photographs specific features on a webpage.

Instead of full-page screenshots, this finds and captures specific UI elements like:
- Chat widgets, booking forms, pricing sections
- Wizards/steppers, navigation, galleries
- Contact forms, testimonials, CTAs, maps, video sections
- Or ANY element via CSS selector

Usage examples:
  targets: ["chat"] → finds and screenshots the chat widget
  targets: ["pricing", "booking"] → screenshots pricing section AND booking form
  targets: ["all"] → auto-detects ALL features on the page
  targets: [{ "feature": "hero", "selector": ".custom-hero" }] → custom selector
  targets: [".my-section"] → direct CSS selector

Supports 15+ feature types with intelligent DOM analysis.`,
    annotations: {
      title: 'Screenshot Page Element',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website to screenshot',
        },
        targets: {
          type: 'array',
          items: {
            oneOf: [
              {
                type: 'string',
                description: 'Feature keyword (chat, pricing, booking, hero, nav, footer, gallery, wizard, testimonial, services, cta, map, video, newsletter, contact) or "all" for auto-detect, or CSS selector (.class, #id)',
              },
              {
                type: 'object',
                properties: {
                  feature: { type: 'string', description: 'Feature name or keyword' },
                  selector: { type: 'string', description: 'Custom CSS selector override' },
                  padding: { type: 'number', description: 'Padding around element in px' },
                  revealFirst: { type: 'boolean', description: 'Click to reveal element first (e.g. chat popup)' },
                },
                required: ['feature'],
              },
            ],
          },
          description: 'What to capture. Array of feature keywords, CSS selectors, or target objects. Use "all" to auto-detect everything.',
        },
        outputDir: {
          type: 'string',
          description: 'Output directory (default: ./output/smart-screenshots)',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'Viewport width (default: 1920)' },
            height: { type: 'number', description: 'Viewport height (default: 1080)' },
          },
          description: 'Custom viewport dimensions',
        },
        darkMode: {
          type: 'boolean',
          description: 'Enable dark mode rendering (default: false)',
        },
        deviceScaleFactor: {
          type: 'number',
          description: 'Device scale factor for retina (default: 1, use 2 for retina)',
        },
        includeFullPage: {
          type: 'boolean',
          description: 'Also capture a full-page screenshot (default: false)',
        },
      },
      required: ['url', 'targets'],
    },
  },
  {
    name: 'detect_page_features',
    description: `Analyze a webpage and detect all available UI features/sections without taking screenshots.

Returns a list of detected features with their names, locations, and sizes.
Useful for planning which elements to screenshot or for understanding page structure.

Detects: Hero, Chat, Booking, Pricing, Contact Form, Navigation, Footer, Gallery, Wizard/Stepper, Testimonials, Services, CTA, Map, Video, Newsletter sections.`,
    annotations: {
      title: 'Detect Page Features',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL of the website to analyze',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
          },
          description: 'Viewport dimensions (default: 1920x1080)',
        },
      },
      required: ['url'],
    },
  },
];
