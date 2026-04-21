/**
 * Smart Screenshot tool handlers
 */

import { jsonResponse, type ToolHandler } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import { smartScreenshot } from '../tools/engine/smart-screenshot.js';
import type { SmartScreenshotConfig, SmartTarget } from '../tools/engine/smart-screenshot.js';
import { guardUrl } from '../lib/url-guard.js';

export const smartScreenshotHandlers: Record<string, ToolHandler> = {
  /**
   * Take element-aware screenshots of specific page features
   */
  screenshot_element: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);
      const config: SmartScreenshotConfig = {
        url: guard.url,
        targets: normalizeTargetArgs(args.targets),
        outputDir: args.outputDir,
        viewport: args.viewport ?? { width: 1920, height: 1080 },
        deviceScaleFactor: args.deviceScaleFactor ?? 1,
        darkMode: args.darkMode ?? false,
        includeFullPage: args.includeFullPage ?? false,
      };

      const result = await smartScreenshot(config);
      return jsonResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`screenshot_element failed: ${message}`);
      return jsonResponse({ success: false, error: message }, true);
    }
  },

  /**
   * Detect page features without taking screenshots
   */
  detect_page_features: async (args) => {
    try {
      const guard = guardUrl(args.url);
      if (!guard.ok) return jsonResponse({ success: false, error: guard.reason }, true);
      const config: SmartScreenshotConfig = {
        url: guard.url,
        targets: ['all'],
        viewport: args.viewport ?? { width: 1920, height: 1080 },
        includeFullPage: false,
      };

      // Use smartScreenshot with includeFullPage=false to just detect
      // We'll capture a quick version that only detects without taking actual screenshots
      const result = await smartScreenshot(config);
      return jsonResponse({
        success: true,
        url: guard.url,
        features: result.detected.map(f => ({
          name: f.name,
          selector: f.selector,
          size: `${f.bounds.width}x${f.bounds.height}`,
          position: `(${Math.round(f.bounds.x)}, ${Math.round(f.bounds.y)})`,
          matchMethod: f.matchMethod,
          confidence: f.confidence,
        })),
        total: result.detected.length,
        screenshots: result.screenshots.map(s => ({
          feature: s.feature,
          path: s.path,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`detect_page_features failed: ${message}`);
      return jsonResponse({ success: false, error: message }, true);
    }
  },
};

function normalizeTargetArgs(targets: unknown): (string | SmartTarget)[] {
  if (!Array.isArray(targets)) {
    return [String(targets)];
  }
  return targets.map(t => {
    if (typeof t === 'string') return t;
    if (typeof t === 'object' && t !== null && 'feature' in t) {
      return t as SmartTarget;
    }
    return String(t);
  });
}
