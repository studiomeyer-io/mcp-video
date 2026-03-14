/**
 * Type definitions for the Cinema Video Engine
 */

// ─── Viewport Presets ───────────────────────────────────────────────
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  'desktop-4k': { width: 3840, height: 2160 },
  tablet: { width: 768, height: 1024 },
  'tablet-landscape': { width: 1024, height: 768 },
  mobile: { width: 393, height: 852 },
  'mobile-landscape': { width: 852, height: 393 },
} as const;

export type ViewportPreset = keyof typeof VIEWPORTS;

export interface ViewportConfig {
  width: number;
  height: number;
}

// ─── Easing ─────────────────────────────────────────────────────────
export type EasingName =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInQuint'
  | 'easeOutQuint'
  | 'easeInOutQuint'
  | 'easeInOutSine'
  | 'cinematic'        // slow start + cruise + slow end
  | 'showcase';        // dramatic slow start, smooth cruise, elegant stop

// ─── Scenes ─────────────────────────────────────────────────────────
export interface SceneBase {
  type: string;
}

export interface ScrollScene extends SceneBase {
  type: 'scroll';
  /** Target: 'bottom', 'top', pixel number, or CSS selector */
  to: 'bottom' | 'top' | number | string;
  /** Duration of the scroll in seconds */
  duration: number;
  /** Easing curve name (default: easeInOutCubic) */
  easing?: EasingName;
}

export interface PauseScene extends SceneBase {
  type: 'pause';
  /** Duration in seconds */
  duration: number;
}

export interface HoverScene extends SceneBase {
  type: 'hover';
  /** CSS selector of element to hover */
  selector: string;
  /** How long to hold the hover (seconds) */
  duration: number;
  /** Move cursor smoothly to element (default: true) */
  animateCursor?: boolean;
}

export interface ClickScene extends SceneBase {
  type: 'click';
  /** CSS selector of element to click */
  selector: string;
  /** Wait strategy after click */
  waitFor?: 'networkidle' | 'load' | number;
  /** Pause after navigation (seconds, default: 1) */
  pauseAfter?: number;
}

export interface TypeScene extends SceneBase {
  type: 'type';
  /** CSS selector of input field */
  selector: string;
  /** Text to type */
  text: string;
  /** Delay between keystrokes in ms (default: 80) */
  delay?: number;
}

export interface WaitScene extends SceneBase {
  type: 'wait';
  /** CSS selector to wait for */
  selector: string;
  /** Max wait time in ms (default: 5000) */
  timeout?: number;
}

export type Scene =
  | ScrollScene
  | PauseScene
  | HoverScene
  | ClickScene
  | TypeScene
  | WaitScene;

// ─── Cursor Config ──────────────────────────────────────────────────
export interface CursorConfig {
  /** Show a visible cursor in the video (default: true) */
  enabled: boolean;
  /** Cursor style */
  style?: 'dot' | 'arrow' | 'pointer' | 'custom';
  /** Cursor color (CSS color string) */
  color?: string;
  /** Cursor size in px (default: 20) */
  size?: number;
  /** Show click animation (default: true) */
  clickAnimation?: boolean;
}

// ─── Encoding Config ────────────────────────────────────────────────
export type VideoCodec = 'h264' | 'h265' | 'vp9';
export type VideoFormat = 'mp4' | 'webm';

export interface EncodingConfig {
  /** Video codec (default: h264) */
  codec?: VideoCodec;
  /** Output format (default: mp4) */
  format?: VideoFormat;
  /** Constant Rate Factor — quality (0=lossless, 51=worst). Default: 18 */
  crf?: number;
  /** Encoding preset (default: slow for best quality) */
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  /** Frames per second (default: 60) */
  fps?: number;
}

// ─── Main Recording Config ──────────────────────────────────────────
export interface RecordingConfig {
  /** URL to record */
  url: string;
  /** Output file path (without extension — auto-determined) */
  outputPath: string;
  /** Viewport preset or custom dimensions */
  viewport?: ViewportPreset | ViewportConfig;
  /** Frames per second (default: 60) */
  fps?: number;
  /** Scene definitions — if empty, does a default full-page scroll */
  scenes?: Scene[];
  /** Cursor configuration */
  cursor?: CursorConfig;
  /** Video encoding settings */
  encoding?: EncodingConfig;
  /** Dismiss cookie banners and overlays (default: true) */
  dismissOverlays?: boolean;
  /** Pre-scroll to trigger lazy loading (default: true) */
  preloadContent?: boolean;
  /** Device scale factor for retina (default: 1) */
  deviceScaleFactor?: number;
  /** Dark mode (default: false) */
  darkMode?: boolean;
  /** Custom user agent */
  userAgent?: string;
  /** Disable smooth scroll CSS to prevent double-easing (default: true) */
  disableSmoothScroll?: boolean;
}

// ─── Recording Result ───────────────────────────────────────────────
export interface RecordingResult {
  success: boolean;
  video: {
    path: string;
    format: string;
    codec: string;
    fps: number;
    duration: number;
    totalFrames: number;
    resolution: { width: number; height: number };
    sizeBytes: number;
    sizeMB: string;
  };
  thumbnail?: {
    path: string;
    width: number;
    height: number;
  };
  scenes: number;
  url: string;
  captureTime: string;
}
