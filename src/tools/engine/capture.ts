/**
 * Frame-by-Frame Capture Engine
 * The core of cinema-grade website video recording
 *
 * Pipeline: Playwright → Frame Screenshots → ffmpeg → MP4
 * Result: Perfect 60fps video with zero frame drops
 */

import { chromium } from 'playwright';
import type { Page, Browser, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../lib/logger.js';
import { guardFinalUrl } from '../../lib/url-guard.js';
import type { RecordingConfig, RecordingResult, ViewportConfig, Scene } from './types.js';
import { VIEWPORTS } from './types.js';
import { injectCursor, hideCursor } from './cursor.js';
import { executeScenes, createDefaultScenes } from './scenes.js';
import { encodeFrames, cleanupFrames } from './encoder.js';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || './output';

/**
 * Record a website with cinema-quality frame-by-frame capture
 */
export async function recordWebsite(config: RecordingConfig): Promise<RecordingResult> {
  const {
    url,
    outputPath = path.join(OUTPUT_DIR, `website-video-${Date.now()}`),
    fps = 60,
    scenes: userScenes,
    cursor = { enabled: true },
    encoding = {},
    dismissOverlays = true,
    preloadContent = true,
    deviceScaleFactor = 1,
    darkMode = false,
    disableSmoothScroll = true,
  } = config;

  // Resolve viewport
  const viewport: ViewportConfig = typeof config.viewport === 'string'
    ? VIEWPORTS[config.viewport] ?? VIEWPORTS.desktop
    : config.viewport ?? VIEWPORTS.desktop;

  // Create temp directory for frames
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinema-frames-'));
  const framePattern = 'frame_%06d.png';

  let browser: Browser | undefined;
  let totalFrames = 0;
  const startTime = Date.now();

  try {
    logger.info(`Starting cinema capture: ${url} (${viewport.width}x${viewport.height}, ${fps}fps)`);

    // ─── 1. Launch Browser ────────────────────────────────────────
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--hide-scrollbars',
      ],
    });

    const contextOptions: Record<string, unknown> = {
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor,
      colorScheme: darkMode ? 'dark' as const : 'light' as const,
    };

    // Mobile user agent
    if (config.viewport === 'mobile' || config.viewport === 'mobile-landscape') {
      contextOptions.userAgent = config.userAgent ??
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      contextOptions.isMobile = true;
      contextOptions.hasTouch = true;
    } else if (config.userAgent) {
      contextOptions.userAgent = config.userAgent;
    }

    const context: BrowserContext = await browser.newContext(contextOptions);
    const page: Page = await context.newPage();

    // ─── 2. Navigate to URL ───────────────────────────────────────
    logger.info(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      // Fallback: try with just domcontentloaded
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });

    // Post-redirect guard: browser may have followed 302/301 to an internal host.
    const finalUrl = page.url();
    const finalGuard = guardFinalUrl(finalUrl);
    if (!finalGuard.ok) {
      throw new Error(`post-redirect check failed — final URL rejected: ${finalGuard.reason}`);
    }

    // Wait for content to render
    await page.waitForTimeout(2000);

    // ─── 3. Prepare Page ──────────────────────────────────────────

    // Disable CSS smooth scroll to prevent double-easing
    if (disableSmoothScroll) {
      await page.addStyleTag({
        content: `*, html { scroll-behavior: auto !important; }`,
      });
    }

    // Hide scrollbar
    await page.addStyleTag({
      content: `::-webkit-scrollbar { display: none !important; } * { scrollbar-width: none !important; }`,
    });

    // Dismiss overlays and cookie banners
    if (dismissOverlays) {
      await dismissPageOverlays(page);
      // Wait for animations to complete (e.g. Framer Motion exit)
      await page.waitForTimeout(1000);
    }

    // ─── 4. Pre-scroll to trigger lazy loading ────────────────────
    if (preloadContent) {
      await preloadAllContent(page, viewport.height);
    }

    // ─── 5. Inject cursor overlay ─────────────────────────────────
    if (cursor.enabled) {
      await injectCursor(page, cursor);
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // ─── 6. Execute scenes & capture frames ───────────────────────
    const scenes: Scene[] = userScenes && userScenes.length > 0
      ? userScenes
      : createDefaultScenes();

    logger.info(`Executing ${scenes.length} scene(s)...`);

    let frameIndex = 0;
    totalFrames = await executeScenes(
      page,
      scenes,
      fps,
      async (_fi: number) => {
        const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(6, '0')}.png`);
        await page.screenshot({ path: framePath, type: 'png' });
        frameIndex++;

        // Progress logging every 60 frames (= 1 second at 60fps)
        if (frameIndex % fps === 0) {
          logger.info(`Captured ${frameIndex} frames (${(frameIndex / fps).toFixed(1)}s)`);
        }
      },
      cursor.enabled
    );

    // Hide cursor for final frame
    if (cursor.enabled) {
      await hideCursor(page);
    }

    // Take thumbnail from first frame position
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const thumbnailBuffer = await page.screenshot({ type: 'png' });
    const thumbnailPath = `${outputPath}-thumbnail.png`;
    const thumbnailDir = path.dirname(thumbnailPath);
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }
    fs.writeFileSync(thumbnailPath, thumbnailBuffer);

    // ─── 7. Close browser ─────────────────────────────────────────
    await context.close();
    await browser.close();
    browser = undefined;

    logger.info(`Capture complete: ${totalFrames} frames in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // ─── 8. Encode video ──────────────────────────────────────────
    logger.info('Encoding video with ffmpeg...');
    const encodeResult = await encodeFrames(
      framesDir,
      framePattern,
      outputPath,
      totalFrames,
      { ...encoding, fps }
    );

    // ─── 9. Cleanup frames ────────────────────────────────────────
    cleanupFrames(framesDir);

    const captureTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Video ready: ${encodeResult.outputPath} (${encodeResult.sizeMB} MB, ${captureTimeSec}s total)`);

    return {
      success: true,
      video: {
        path: encodeResult.outputPath,
        format: encodeResult.format,
        codec: encodeResult.codec,
        fps: encodeResult.fps,
        duration: encodeResult.duration,
        totalFrames: encodeResult.totalFrames,
        resolution: { width: viewport.width, height: viewport.height },
        sizeBytes: encodeResult.sizeBytes,
        sizeMB: encodeResult.sizeMB,
      },
      thumbnail: {
        path: thumbnailPath,
        width: viewport.width,
        height: viewport.height,
      },
      scenes: scenes.length,
      url,
      captureTime: `${captureTimeSec}s`,
    };
  } catch (error) {
    // Cleanup on error
    cleanupFrames(framesDir);
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Recording failed: ${message}`);
    throw new Error(`Recording failed: ${message}`);
  }
}

/**
 * Dismiss cookie banners, fixed overlays, and popups
 * Uses multiple strategies: localStorage pre-set, button clicks, CSS hiding
 */
async function dismissPageOverlays(page: Page): Promise<void> {
  logger.info('Dismissing overlays and cookie banners...');

  // Strategy 1: Pre-set common cookie consent localStorage/cookie values
  // This prevents banners from appearing in the first place
  await page.evaluate(() => {
    // Common cookie consent localStorage key
    localStorage.setItem('cookie-consent', 'accepted');
    // Common cookie consent libraries
    localStorage.setItem('cookieConsent', 'accepted');
    localStorage.setItem('cookie_consent', 'true');
    localStorage.setItem('cookies-accepted', 'true');
    localStorage.setItem('gdpr-consent', 'true');
    localStorage.setItem('CookieConsent', 'true');
    // CookieBot
    localStorage.setItem('CookieConsentV2', '{"stamp":"","necessary":true,"preferences":true,"statistics":true,"marketing":true}');
    // OneTrust
    localStorage.setItem('OptanonAlertBoxClosed', new Date().toISOString());

    // Set cookies too
    document.cookie = 'cookie-consent=accepted; path=/; max-age=31536000';
    document.cookie = 'cookieconsent_status=dismiss; path=/; max-age=31536000';

    // Dispatch custom consent event
    window.dispatchEvent(new Event('cookie-consent-accepted'));
  });

  await page.waitForTimeout(300);

  // Strategy 2: Try clicking accept buttons (multilingual)
  const acceptButtonSelectors = [
    // By text content (most reliable)
    'button:has-text("Akzeptieren")',
    'button:has-text("Accept")',
    'button:has-text("Aceptar")',
    'button:has-text("Accept all")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("Verstanden")',
  ];

  for (const selector of acceptButtonSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1000 });
        logger.info(`Clicked consent button: ${selector}`);
        break;
      }
    } catch {
      // Button not found, try next
    }
  }

  // Strategy 3: Click by CSS selectors (fallback)
  await page.evaluate(() => {
    const cssSelectors = [
      '[class*="cookie"] button',
      '[class*="consent"] button',
      '[id*="cookie"] button',
      '[id*="consent"] button',
      'button[class*="accept"]',
      'button[class*="Accept"]',
      '[data-testid*="cookie"] button',
    ];

    for (const sel of cssSelectors) {
      const btn = document.querySelector<HTMLElement>(sel);
      if (btn) {
        btn.click();
        break;
      }
    }
  });

  await page.waitForTimeout(500);

  // Strategy 4: Force hide any remaining overlays via CSS
  await page.addStyleTag({
    content: `
      [class*="cookie"], [class*="Cookie"],
      [class*="consent"], [class*="Consent"],
      [class*="popup"]:not([class*="menu"]),
      [class*="Popup"]:not([class*="menu"]),
      [id*="cookie"], [id*="consent"],
      [role="dialog"],
      [class*="banner"]:not(header):not(nav):not([class*="hero"]),
      .fixed.bottom-0.left-0.right-0.z-50 {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,
  });

  logger.info('Overlays dismissed');
}

/**
 * Pre-scroll entire page to trigger all lazy-loaded content
 */
async function preloadAllContent(page: Page, viewportHeight: number): Promise<void> {
  logger.info('Pre-scrolling to trigger lazy content...');

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = Math.ceil(scrollHeight / (viewportHeight * 0.7));

  for (let i = 0; i <= steps; i++) {
    const y = Math.min(i * viewportHeight * 0.7, scrollHeight);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(200);

    // Wait for any network requests to settle
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  logger.info('Lazy content preloaded');
}
