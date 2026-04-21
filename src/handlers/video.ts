/**
 * Video recording tool handlers
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import { recordWebsite } from '../tools/index.js';
import type { RecordingConfig, Scene, ViewportPreset } from '../tools/index.js';
import * as path from 'path';
import { guardUrl } from '../lib/url-guard.js';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || './output';

export const videoHandlers: Record<string, ToolHandler> = {
  /**
   * Full-featured website video recording
   */
  record_website_video: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);
      const config: RecordingConfig = {
        url: guard.url,
        outputPath: args.outputPath ?? generateOutputPath(guard.url, 'video'),
        viewport: args.viewport as ViewportPreset ?? 'desktop',
        fps: args.fps ?? 60,
        scenes: args.scenes as Scene[] | undefined,
        cursor: args.cursor ?? { enabled: true },
        encoding: {
          codec: args.codec ?? 'h264',
          crf: args.quality ?? 18,
        },
        darkMode: args.darkMode ?? false,
        preloadContent: args.preloadContent ?? true,
        dismissOverlays: args.dismissOverlays ?? true,
      };

      const result = await recordWebsite(config);
      return jsonResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`record_website_video failed: ${message}`);
      return jsonResponse({ success: false, error: message }, true);
    }
  },

  /**
   * Quick scroll-through video
   */
  record_website_scroll: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);
      const duration = args.duration ?? 12;
      const easing = args.easing ?? 'showcase';

      const config: RecordingConfig = {
        url: guard.url,
        outputPath: args.outputPath ?? generateOutputPath(guard.url, 'scroll'),
        viewport: (args.viewport as ViewportPreset) ?? 'desktop',
        fps: 60,
        scenes: [
          { type: 'pause', duration: 1.5 },
          { type: 'scroll', to: 'bottom', duration, easing },
          { type: 'pause', duration: 2 },
        ],
        cursor: { enabled: false },
        encoding: { codec: 'h264', crf: 18 },
      };

      const result = await recordWebsite(config);
      return jsonResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`record_website_scroll failed: ${message}`);
      return jsonResponse({ success: false, error: message }, true);
    }
  },

  /**
   * Multi-device recording
   */
  record_multi_device: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);
      const devices: ViewportPreset[] = args.devices ?? ['desktop', 'tablet', 'mobile'];
      const duration = args.duration ?? 10;
      const outputDir = args.outputDir ?? OUTPUT_DIR;
      const results: Record<string, unknown> = {};

      for (const device of devices) {
        logger.info(`Recording ${device} viewport for ${guard.url}...`);

        const config: RecordingConfig = {
          url: guard.url,
          outputPath: path.join(outputDir, generateOutputName(guard.url, device)),
          viewport: device,
          fps: 60,
          scenes: [
            { type: 'pause', duration: 1 },
            { type: 'scroll', to: 'bottom', duration, easing: 'showcase' },
            { type: 'pause', duration: 1.5 },
          ],
          cursor: { enabled: device !== 'mobile' && device !== 'mobile-landscape' },
          encoding: { codec: 'h264', crf: 18 },
        };

        const result = await recordWebsite(config);
        results[device] = result;
      }

      return jsonResponse({
        success: true,
        devices: devices.length,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`record_multi_device failed: ${message}`);
      return jsonResponse({ success: false, error: message }, true);
    }
  },
};

/**
 * Generate a descriptive output path from URL
 */
function generateOutputPath(url: string, prefix: string): string {
  const name = generateOutputName(url, prefix);
  return path.join(OUTPUT_DIR, name);
}

function generateOutputName(url: string, suffix: string): string {
  try {
    const hostname = new URL(url).hostname
      .replace(/^www\./, '')
      .replace(/\./g, '-');
    const timestamp = new Date().toISOString().slice(0, 10);
    return `${hostname}-${suffix}-${timestamp}`;
  } catch {
    return `website-${suffix}-${Date.now()}`;
  }
}
