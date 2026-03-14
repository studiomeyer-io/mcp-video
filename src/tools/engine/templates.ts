/**
 * Video Template Engine — Pre-built video templates for common use cases.
 *
 * Templates define: clip slots, timing, transitions, text placeholders,
 * effects, color grades, and music style.
 *
 * The renderer (template-renderer.ts) takes a template + user assets
 * and produces a finished video using all existing engines.
 */

import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export type TemplateCategory =
  | 'social-reel'
  | 'product-demo'
  | 'testimonial'
  | 'before-after'
  | 'slideshow'
  | 'tutorial'
  | 'announcement'
  | 'promo';

export interface TemplateSlot {
  /** Slot name (e.g., 'intro-clip', 'product-shot-1') */
  name: string;
  /** Duration of this slot in seconds */
  duration: number;
  /** Whether this slot is required */
  required: boolean;
  /** Description of what should go in this slot */
  description: string;
  /** Slot type */
  type: 'video' | 'image' | 'text';
}

export interface TemplateTextPlaceholder {
  /** Placeholder name (e.g., 'title', 'subtitle', 'cta') */
  name: string;
  /** Default text */
  defaultText: string;
  /** Text animation to use */
  animation: string;
  /** When to show (seconds from start) */
  startTime: number;
  /** How long to show (seconds) */
  duration: number;
  /** Position on screen */
  position: string;
  /** Font size */
  fontSize: number;
}

export interface VideoTemplate {
  /** Unique template ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category for filtering */
  category: TemplateCategory;
  /** Description of the template */
  description: string;
  /** Total duration in seconds */
  totalDuration: number;
  /** Aspect ratio */
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  /** Resolution */
  resolution: { width: number; height: number };
  /** Clip/asset slots */
  slots: TemplateSlot[];
  /** Text placeholders */
  textPlaceholders: TemplateTextPlaceholder[];
  /** Transition between clips */
  transition: string;
  /** Recommended color grade preset */
  colorGrade?: string;
  /** Recommended music style */
  musicStyle: string;
  /** Tags for search */
  tags: string[];
}

// ─── Template Definitions ───────────────────────────────────────────

const TEMPLATES: VideoTemplate[] = [
  // ─── Social Reel ─────────────────────────────────────────────
  {
    id: 'social-reel-hype',
    name: 'Hype Reel',
    category: 'social-reel',
    description: 'Fast-paced 15-second reel with 5 quick cuts, beat-synced feel, bold text overlays. Perfect for Instagram/TikTok.',
    totalDuration: 15,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    slots: [
      { name: 'hook-clip', duration: 3, required: true, description: 'Opening hook — attention-grabbing first 3 seconds', type: 'video' },
      { name: 'clip-2', duration: 3, required: true, description: 'Second clip — show the product/action', type: 'video' },
      { name: 'clip-3', duration: 3, required: true, description: 'Third clip — build momentum', type: 'video' },
      { name: 'clip-4', duration: 3, required: false, description: 'Fourth clip — variety shot', type: 'video' },
      { name: 'cta-clip', duration: 3, required: true, description: 'Closing CTA clip', type: 'video' },
    ],
    textPlaceholders: [
      { name: 'hook-text', defaultText: 'WATCH THIS', animation: 'pop', startTime: 0.2, duration: 2.5, position: 'center', fontSize: 64 },
      { name: 'cta-text', defaultText: 'FOLLOW FOR MORE', animation: 'slide-up', startTime: 12, duration: 3, position: 'bottom', fontSize: 48 },
    ],
    transition: 'fade',
    colorGrade: 'high-contrast-music',
    musicStyle: 'upbeat, energetic, trending audio',
    tags: ['reel', 'tiktok', 'instagram', 'fast', 'hype', 'trending'],
  },

  {
    id: 'social-reel-aesthetic',
    name: 'Aesthetic Reel',
    category: 'social-reel',
    description: 'Slow, cinematic 30-second reel with smooth transitions and warm color grading. Great for lifestyle/travel content.',
    totalDuration: 30,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    slots: [
      { name: 'opening', duration: 5, required: true, description: 'Slow opening shot — set the mood', type: 'video' },
      { name: 'scene-2', duration: 5, required: true, description: 'Second scene — establish context', type: 'video' },
      { name: 'scene-3', duration: 5, required: true, description: 'Third scene — main content', type: 'video' },
      { name: 'scene-4', duration: 5, required: false, description: 'Fourth scene — detail shot', type: 'video' },
      { name: 'scene-5', duration: 5, required: false, description: 'Fifth scene — variety', type: 'video' },
      { name: 'closing', duration: 5, required: true, description: 'Closing scene — satisfying end', type: 'video' },
    ],
    textPlaceholders: [
      { name: 'title', defaultText: 'Golden Hour', animation: 'fade-in', startTime: 1, duration: 4, position: 'center', fontSize: 56 },
      { name: 'location', defaultText: 'Somewhere Beautiful', animation: 'fade-in-out', startTime: 6, duration: 4, position: 'bottom', fontSize: 36 },
    ],
    transition: 'crossfade',
    colorGrade: 'warm-golden',
    musicStyle: 'ambient, lo-fi, chill',
    tags: ['aesthetic', 'cinematic', 'lifestyle', 'travel', 'slow'],
  },

  // ─── Product Demo ────────────────────────────────────────────
  {
    id: 'product-demo-saas',
    name: 'SaaS Product Demo',
    category: 'product-demo',
    description: '60-second product demo: problem → solution → features → CTA. Clean look with screen recordings.',
    totalDuration: 60,
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    slots: [
      { name: 'problem', duration: 10, required: true, description: 'Show the problem your product solves', type: 'video' },
      { name: 'intro-screen', duration: 5, required: true, description: 'Product name / logo reveal', type: 'video' },
      { name: 'feature-1', duration: 12, required: true, description: 'Screen recording of feature 1', type: 'video' },
      { name: 'feature-2', duration: 12, required: true, description: 'Screen recording of feature 2', type: 'video' },
      { name: 'feature-3', duration: 12, required: false, description: 'Screen recording of feature 3', type: 'video' },
      { name: 'cta', duration: 9, required: true, description: 'Closing with CTA', type: 'video' },
    ],
    textPlaceholders: [
      { name: 'problem-text', defaultText: 'Tired of manual work?', animation: 'typewriter', startTime: 1, duration: 4, position: 'center', fontSize: 52 },
      { name: 'product-name', defaultText: 'Product Name', animation: 'pop', startTime: 11, duration: 4, position: 'center', fontSize: 72 },
      { name: 'feature-1-label', defaultText: 'Feature One', animation: 'slide-left', startTime: 16, duration: 3, position: 'top', fontSize: 36 },
      { name: 'feature-2-label', defaultText: 'Feature Two', animation: 'slide-left', startTime: 28, duration: 3, position: 'top', fontSize: 36 },
      { name: 'cta-text', defaultText: 'Try Free Today', animation: 'bounce', startTime: 52, duration: 7, position: 'center', fontSize: 64 },
    ],
    transition: 'fade',
    colorGrade: 'cinematic-teal-orange-subtle',
    musicStyle: 'corporate, uplifting, modern',
    tags: ['saas', 'demo', 'product', 'screen-recording', 'corporate'],
  },

  // ─── Testimonial ─────────────────────────────────────────────
  {
    id: 'testimonial-single',
    name: 'Customer Testimonial',
    category: 'testimonial',
    description: '30-second testimonial: quote + customer name + product shot. Warm, trustworthy feel.',
    totalDuration: 30,
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    slots: [
      { name: 'customer-video', duration: 20, required: true, description: 'Customer speaking / interview clip', type: 'video' },
      { name: 'product-shot', duration: 7, required: true, description: 'Product being used', type: 'video' },
      { name: 'logo-end', duration: 3, required: false, description: 'Company logo end card', type: 'image' },
    ],
    textPlaceholders: [
      { name: 'quote', defaultText: '"This changed everything for us."', animation: 'fade-in', startTime: 2, duration: 8, position: 'bottom', fontSize: 36 },
      { name: 'name', defaultText: 'Jane Doe, CEO at Company', animation: 'slide-up', startTime: 20, duration: 5, position: 'bottom', fontSize: 32 },
    ],
    transition: 'crossfade',
    colorGrade: 'warm-golden',
    musicStyle: 'soft piano, inspirational',
    tags: ['testimonial', 'customer', 'review', 'trust'],
  },

  // ─── Before-After ────────────────────────────────────────────
  {
    id: 'before-after-split',
    name: 'Before & After',
    category: 'before-after',
    description: '15-second split-screen before/after comparison. Great for transformations, renovations, edits.',
    totalDuration: 15,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    slots: [
      { name: 'before', duration: 7, required: true, description: 'Before state', type: 'video' },
      { name: 'after', duration: 7, required: true, description: 'After state (transformation)', type: 'video' },
    ],
    textPlaceholders: [
      { name: 'before-label', defaultText: 'BEFORE', animation: 'pop', startTime: 0.5, duration: 3, position: 'top', fontSize: 56 },
      { name: 'after-label', defaultText: 'AFTER', animation: 'pop', startTime: 7.5, duration: 3, position: 'top', fontSize: 56 },
    ],
    transition: 'wipe',
    musicStyle: 'dramatic reveal, build-up',
    tags: ['before-after', 'transformation', 'comparison', 'reveal'],
  },

  // ─── Slideshow ───────────────────────────────────────────────
  {
    id: 'slideshow-photo',
    name: 'Photo Slideshow',
    category: 'slideshow',
    description: '45-second photo slideshow with Ken Burns effect (slow zoom/pan). Perfect for memories, events, portfolios.',
    totalDuration: 45,
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    slots: [
      { name: 'photo-1', duration: 5, required: true, description: 'First photo', type: 'image' },
      { name: 'photo-2', duration: 5, required: true, description: 'Second photo', type: 'image' },
      { name: 'photo-3', duration: 5, required: true, description: 'Third photo', type: 'image' },
      { name: 'photo-4', duration: 5, required: false, description: 'Fourth photo', type: 'image' },
      { name: 'photo-5', duration: 5, required: false, description: 'Fifth photo', type: 'image' },
      { name: 'photo-6', duration: 5, required: false, description: 'Sixth photo', type: 'image' },
      { name: 'photo-7', duration: 5, required: false, description: 'Seventh photo', type: 'image' },
      { name: 'photo-8', duration: 5, required: false, description: 'Eighth photo', type: 'image' },
      { name: 'photo-9', duration: 5, required: false, description: 'Ninth photo (closing)', type: 'image' },
    ],
    textPlaceholders: [
      { name: 'title', defaultText: 'Memories', animation: 'fade-in-out', startTime: 0, duration: 5, position: 'center', fontSize: 72 },
    ],
    transition: 'crossfade',
    colorGrade: 'vintage-film',
    musicStyle: 'emotional, acoustic, nostalgic',
    tags: ['slideshow', 'photos', 'memories', 'event', 'portfolio'],
  },

  // ─── Tutorial ────────────────────────────────────────────────
  {
    id: 'tutorial-howto',
    name: 'How-To Tutorial',
    category: 'tutorial',
    description: '90-second step-by-step tutorial: intro → step 1 → step 2 → step 3 → summary. Clean and instructional.',
    totalDuration: 90,
    aspectRatio: '16:9',
    resolution: { width: 1920, height: 1080 },
    slots: [
      { name: 'intro', duration: 10, required: true, description: 'What you will learn', type: 'video' },
      { name: 'step-1', duration: 20, required: true, description: 'Step 1 demonstration', type: 'video' },
      { name: 'step-2', duration: 20, required: true, description: 'Step 2 demonstration', type: 'video' },
      { name: 'step-3', duration: 20, required: false, description: 'Step 3 demonstration', type: 'video' },
      { name: 'summary', duration: 10, required: true, description: 'Summary / final result', type: 'video' },
      { name: 'outro', duration: 10, required: false, description: 'Subscribe / follow CTA', type: 'video' },
    ],
    textPlaceholders: [
      { name: 'title', defaultText: 'How to...', animation: 'typewriter', startTime: 1, duration: 5, position: 'center', fontSize: 56 },
      { name: 'step-1-label', defaultText: 'Step 1', animation: 'slide-left', startTime: 10, duration: 3, position: 'top-left', fontSize: 40 },
      { name: 'step-2-label', defaultText: 'Step 2', animation: 'slide-left', startTime: 30, duration: 3, position: 'top-left', fontSize: 40 },
      { name: 'step-3-label', defaultText: 'Step 3', animation: 'slide-left', startTime: 50, duration: 3, position: 'top-left', fontSize: 40 },
      { name: 'done-text', defaultText: "That's it!", animation: 'bounce', startTime: 70, duration: 5, position: 'center', fontSize: 64 },
    ],
    transition: 'fade',
    musicStyle: 'lo-fi background, subtle',
    tags: ['tutorial', 'howto', 'educational', 'step-by-step'],
  },

  // ─── Announcement ────────────────────────────────────────────
  {
    id: 'announcement-launch',
    name: 'Product Launch',
    category: 'announcement',
    description: '20-second product launch announcement: dramatic reveal with bold text. High energy.',
    totalDuration: 20,
    aspectRatio: '1:1',
    resolution: { width: 1080, height: 1080 },
    slots: [
      { name: 'teaser', duration: 5, required: true, description: 'Build-up / teaser shot', type: 'video' },
      { name: 'reveal', duration: 8, required: true, description: 'Product reveal moment', type: 'video' },
      { name: 'details', duration: 4, required: false, description: 'Key features / details', type: 'video' },
      { name: 'cta', duration: 3, required: true, description: 'CTA end card', type: 'image' },
    ],
    textPlaceholders: [
      { name: 'coming', defaultText: 'Something Big...', animation: 'fade-in', startTime: 0.5, duration: 4, position: 'center', fontSize: 56 },
      { name: 'product', defaultText: 'INTRODUCING', animation: 'pop', startTime: 5, duration: 3, position: 'top', fontSize: 48 },
      { name: 'name', defaultText: 'Product Name', animation: 'bounce', startTime: 6, duration: 5, position: 'center', fontSize: 72 },
      { name: 'cta-text', defaultText: 'Available Now', animation: 'slide-up', startTime: 17, duration: 3, position: 'center', fontSize: 52 },
    ],
    transition: 'fade',
    colorGrade: 'cyberpunk-neon',
    musicStyle: 'dramatic, cinematic trailer, build-up + drop',
    tags: ['launch', 'announcement', 'product', 'reveal', 'dramatic'],
  },

  // ─── Promo ───────────────────────────────────────────────────
  {
    id: 'promo-sale',
    name: 'Sale Promo',
    category: 'promo',
    description: '10-second sale/discount promo: bold numbers, urgency, CTA. Perfect for stories/ads.',
    totalDuration: 10,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    slots: [
      { name: 'product-shot', duration: 5, required: true, description: 'Product in action', type: 'video' },
      { name: 'cta-shot', duration: 5, required: true, description: 'End card with CTA', type: 'image' },
    ],
    textPlaceholders: [
      { name: 'discount', defaultText: '50% OFF', animation: 'pop', startTime: 0.3, duration: 4, position: 'center', fontSize: 96 },
      { name: 'limited', defaultText: 'LIMITED TIME', animation: 'shake', startTime: 1, duration: 3, position: 'top', fontSize: 36 },
      { name: 'cta', defaultText: 'SHOP NOW', animation: 'bounce', startTime: 5.5, duration: 4, position: 'center', fontSize: 64 },
    ],
    transition: 'fade',
    colorGrade: 'blockbuster-extreme',
    musicStyle: 'urgent, energetic, short',
    tags: ['sale', 'promo', 'discount', 'ad', 'story'],
  },
];

// ─── Functions ──────────────────────────────────────────────────────

/** List all available templates, optionally filtered by category */
export function listTemplates(category?: TemplateCategory): VideoTemplate[] {
  if (category) {
    return TEMPLATES.filter(t => t.category === category);
  }
  return TEMPLATES;
}

/** Get a specific template by ID */
export function getTemplate(id: string): VideoTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

/** Get all template categories */
export function getTemplateCategories(): TemplateCategory[] {
  return ['social-reel', 'product-demo', 'testimonial', 'before-after', 'slideshow', 'tutorial', 'announcement', 'promo'];
}

/** Get template summary for listing */
export function getTemplateSummaries(category?: TemplateCategory): Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  aspectRatio: string;
  requiredSlots: number;
  optionalSlots: number;
  tags: string[];
}> {
  const templates = category ? listTemplates(category) : TEMPLATES;

  return templates.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    duration: `${t.totalDuration}s`,
    aspectRatio: t.aspectRatio,
    requiredSlots: t.slots.filter(s => s.required).length,
    optionalSlots: t.slots.filter(s => !s.required).length,
    tags: t.tags,
  }));
}
