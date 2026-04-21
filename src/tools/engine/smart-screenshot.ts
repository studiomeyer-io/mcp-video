/**
 * Smart Screenshot Engine
 *
 * Element-aware screenshot system that can target specific page features.
 * Instead of full-page screenshots, this finds and captures specific UI elements
 * like chat widgets, booking forms, pricing sections, wizards, etc.
 *
 * Usage:
 *   smartScreenshot({ url: '...', targets: ['chat', 'pricing', 'booking'] })
 *   smartScreenshot({ url: '...', targets: [{ selector: '.hero-section' }] })
 *   smartScreenshot({ url: '...', targets: ['all'] }) // auto-detect all features
 */

import { chromium } from 'playwright';
import type { Page, Browser, BrowserContext, ElementHandle } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';
import { guardFinalUrl } from '../../lib/url-guard.js';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || './output';

// ─── Feature Detection Patterns ─────────────────────────────────────

interface FeaturePattern {
  /** Human-readable name */
  name: string;
  /** Keywords that map to this feature (user says "chat" → matches this) */
  keywords: string[];
  /** CSS selectors to try (in priority order) */
  selectors: string[];
  /** Text patterns to search for in visible text */
  textPatterns: RegExp[];
  /** ARIA role patterns */
  ariaRoles: string[];
  /** Minimum expected size (to filter out tiny elements) */
  minSize?: { width: number; height: number };
  /** Padding around element in px */
  padding?: number;
  /** Should we scroll to this element first? */
  scrollTo?: boolean;
  /** Should we wait for this element to appear? (e.g. chat popup) */
  waitFor?: boolean;
  /** Click something first to reveal the element? */
  revealSelector?: string;
}

const FEATURE_PATTERNS: FeaturePattern[] = [
  {
    name: 'Hero Section',
    keywords: ['hero', 'header', 'banner', 'above-fold', 'startseite', 'landing'],
    selectors: [
      '[class*="hero"]', '[id*="hero"]',
      '[class*="Hero"]', '[id*="Hero"]',
      'section:first-of-type',
      'main > section:first-child',
      'main > div:first-child',
      '[class*="banner"]:not([class*="cookie"])',
      '[class*="landing"]',
      '[class*="jumbotron"]',
    ],
    textPatterns: [],
    ariaRoles: ['banner'],
    minSize: { width: 600, height: 300 },
    padding: 0,
  },
  {
    name: 'Chat Widget',
    keywords: ['chat', 'chatbot', 'messenger', 'live-chat', 'support-chat', 'bot'],
    selectors: [
      '[class*="chat"]', '[id*="chat"]',
      '[class*="Chat"]', '[id*="Chat"]',
      '[class*="chatbot"]', '[id*="chatbot"]',
      '[class*="messenger"]',
      '[class*="widget"]',
      '[class*="intercom"]',
      '[class*="crisp"]',
      '[class*="tawk"]',
      '[class*="zendesk"]',
      '[data-testid*="chat"]',
      'iframe[src*="chat"]',
    ],
    textPatterns: [/chat/i, /nachricht/i, /fragen/i, /hilfe/i],
    ariaRoles: ['dialog', 'complementary'],
    minSize: { width: 200, height: 200 },
    padding: 10,
    scrollTo: false,
    waitFor: true,
    revealSelector: '[class*="chat"] button, [class*="Chat"] button, [class*="chat-trigger"], [class*="chat-toggle"], button[aria-label*="chat" i], button[aria-label*="Chat"]',
  },
  {
    name: 'Booking System',
    keywords: ['booking', 'buchung', 'reservation', 'reservierung', 'buchen', 'termin', 'appointment', 'kalender', 'calendar'],
    selectors: [
      '[class*="booking"]', '[id*="booking"]',
      '[class*="Booking"]', '[id*="Booking"]',
      '[class*="reservation"]', '[id*="reservation"]',
      '[class*="calendar"]', '[id*="calendar"]',
      '[class*="appointment"]',
      '[class*="scheduler"]',
      '[class*="datepicker"]',
      'form[action*="book"]',
      'form[action*="reserv"]',
    ],
    textPatterns: [/buchen/i, /reserv/i, /termin/i, /book/i, /appointment/i],
    ariaRoles: ['form'],
    minSize: { width: 300, height: 200 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Pricing Section',
    keywords: ['pricing', 'preise', 'preis', 'tarife', 'pakete', 'plans', 'packages', 'kosten', 'abo'],
    selectors: [
      '[class*="pricing"]', '[id*="pricing"]',
      '[class*="Pricing"]', '[id*="Pricing"]',
      '[class*="price"]', '[id*="price"]',
      '[class*="plans"]', '[id*="plans"]',
      '[class*="packages"]', '[id*="packages"]',
      '[class*="tarif"]', '[id*="tarif"]',
    ],
    textPatterns: [/\d+\s*[€$£]/i, /pro monat/i, /per month/i, /\/mo/i, /pricing/i, /preise/i],
    ariaRoles: [],
    minSize: { width: 400, height: 200 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Contact Form',
    keywords: ['contact', 'kontakt', 'form', 'formular', 'anfrage', 'inquiry', 'nachricht', 'message'],
    selectors: [
      '[class*="contact"]', '[id*="contact"]',
      '[class*="Contact"]', '[id*="Contact"]',
      '[class*="kontakt"]', '[id*="kontakt"]',
      'form:not([class*="search"]):not([class*="login"]):not([class*="newsletter"])',
      '[class*="inquiry"]',
      '[class*="anfrage"]',
    ],
    textPatterns: [/kontakt/i, /contact/i, /nachricht senden/i, /send message/i, /anfrage/i],
    ariaRoles: ['form'],
    minSize: { width: 300, height: 200 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Navigation',
    keywords: ['nav', 'navigation', 'menu', 'header-nav', 'navbar', 'menubar'],
    selectors: [
      'nav', 'header nav',
      '[class*="nav"]', '[id*="nav"]',
      '[class*="Nav"]', '[id*="Nav"]',
      '[class*="navbar"]',
      '[class*="menu"]:not([class*="footer"])',
      '[role="navigation"]',
    ],
    textPatterns: [],
    ariaRoles: ['navigation', 'menubar'],
    minSize: { width: 600, height: 40 },
    padding: 5,
    scrollTo: false,
  },
  {
    name: 'Footer',
    keywords: ['footer', 'fusszeile'],
    selectors: [
      'footer', '[class*="footer"]', '[id*="footer"]',
      '[class*="Footer"]', '[id*="Footer"]',
      '[role="contentinfo"]',
    ],
    textPatterns: [],
    ariaRoles: ['contentinfo'],
    minSize: { width: 600, height: 100 },
    padding: 0,
    scrollTo: true,
  },
  {
    name: 'Gallery / Portfolio',
    keywords: ['gallery', 'galerie', 'portfolio', 'showcase', 'projekte', 'projects', 'work', 'arbeiten'],
    selectors: [
      '[class*="gallery"]', '[id*="gallery"]',
      '[class*="Gallery"]', '[id*="Gallery"]',
      '[class*="portfolio"]', '[id*="portfolio"]',
      '[class*="Portfolio"]', '[id*="Portfolio"]',
      '[class*="showcase"]',
      '[class*="projects"]', '[id*="projects"]',
      '[class*="grid"]:has(img)',
    ],
    textPatterns: [/portfolio/i, /projekte/i, /projects/i, /galerie/i, /gallery/i, /unsere arbeit/i],
    ariaRoles: [],
    minSize: { width: 400, height: 300 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Wizard / Stepper',
    keywords: ['wizard', 'stepper', 'steps', 'schritte', 'onboarding', 'flow', 'multi-step', 'progress'],
    selectors: [
      '[class*="wizard"]', '[id*="wizard"]',
      '[class*="Wizard"]', '[id*="Wizard"]',
      '[class*="stepper"]', '[id*="stepper"]',
      '[class*="steps"]', '[id*="steps"]',
      '[class*="onboarding"]', '[id*="onboarding"]',
      '[class*="progress-bar"]',
      '[class*="step-indicator"]',
      '[role="progressbar"]',
    ],
    textPatterns: [/schritt \d/i, /step \d/i],
    ariaRoles: ['progressbar'],
    minSize: { width: 300, height: 200 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Testimonials / Reviews',
    keywords: ['testimonial', 'review', 'bewertung', 'kundenstimmen', 'feedback', 'referenzen'],
    selectors: [
      '[class*="testimonial"]', '[id*="testimonial"]',
      '[class*="Testimonial"]', '[id*="Testimonial"]',
      '[class*="review"]', '[id*="review"]',
      '[class*="feedback"]',
      '[class*="quote"]',
    ],
    textPatterns: [/testimonial/i, /bewertung/i, /kundenstimm/i, /review/i],
    ariaRoles: [],
    minSize: { width: 300, height: 150 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'Services / Features',
    keywords: ['services', 'leistungen', 'features', 'funktionen', 'angebot', 'offering'],
    selectors: [
      '[class*="services"]', '[id*="services"]',
      '[class*="Services"]', '[id*="Services"]',
      '[class*="features"]', '[id*="features"]',
      '[class*="Features"]', '[id*="Features"]',
      '[class*="leistung"]', '[id*="leistung"]',
      '[class*="offering"]',
    ],
    textPatterns: [/leistungen/i, /services/i, /features/i, /was wir/i, /what we/i],
    ariaRoles: [],
    minSize: { width: 400, height: 200 },
    padding: 20,
    scrollTo: true,
  },
  {
    name: 'CTA / Call-to-Action',
    keywords: ['cta', 'call-to-action', 'button', 'action', 'jetzt-starten', 'get-started'],
    selectors: [
      '[class*="cta"]', '[id*="cta"]',
      '[class*="CTA"]', '[id*="CTA"]',
      '[class*="call-to-action"]',
      'a[class*="btn-primary"]',
      'a[class*="button-primary"]',
      '[class*="hero"] a[class*="btn"]',
      '[class*="hero"] button',
    ],
    textPatterns: [/jetzt starten/i, /get started/i, /kostenlos/i, /free trial/i, /jetzt buchen/i],
    ariaRoles: [],
    minSize: { width: 100, height: 30 },
    padding: 30,
    scrollTo: true,
  },
  {
    name: 'Map / Location',
    keywords: ['map', 'karte', 'standort', 'location', 'anfahrt', 'directions'],
    selectors: [
      '[class*="map"]', '[id*="map"]',
      '[class*="Map"]', '[id*="Map"]',
      '[class*="location"]', '[id*="location"]',
      '[class*="standort"]',
      'iframe[src*="maps"]',
      'iframe[src*="google.com/maps"]',
      '.mapboxgl-map',
      '.leaflet-container',
    ],
    textPatterns: [/standort/i, /location/i, /anfahrt/i],
    ariaRoles: [],
    minSize: { width: 300, height: 200 },
    padding: 10,
    scrollTo: true,
  },
  {
    name: 'Video Section',
    keywords: ['video', 'player', 'media'],
    selectors: [
      'video', '[class*="video"]', '[id*="video"]',
      '[class*="Video"]', '[id*="Video"]',
      '[class*="player"]',
      'iframe[src*="youtube"]',
      'iframe[src*="vimeo"]',
    ],
    textPatterns: [],
    ariaRoles: [],
    minSize: { width: 300, height: 200 },
    padding: 10,
    scrollTo: true,
  },
  {
    name: 'Newsletter / Subscribe',
    keywords: ['newsletter', 'subscribe', 'abonnieren', 'email-signup'],
    selectors: [
      '[class*="newsletter"]', '[id*="newsletter"]',
      '[class*="Newsletter"]', '[id*="Newsletter"]',
      '[class*="subscribe"]', '[id*="subscribe"]',
      'form:has(input[type="email"]):not(:has(input[type="password"]))',
    ],
    textPatterns: [/newsletter/i, /abonnieren/i, /subscribe/i],
    ariaRoles: [],
    minSize: { width: 200, height: 80 },
    padding: 20,
    scrollTo: true,
  },
];

// ─── Types ────────────────────────────────────────────────────────────

export interface SmartTarget {
  /** Feature keyword (e.g. "chat", "pricing") or CSS selector (prefixed with .) or "all" for auto-detect */
  feature: string;
  /** Optional: custom CSS selector override */
  selector?: string;
  /** Optional: custom padding around element */
  padding?: number;
  /** Optional: click to reveal before screenshot */
  revealFirst?: boolean;
}

export interface SmartScreenshotConfig {
  /** URL to screenshot */
  url: string;
  /** What to capture - keywords, selectors, or "all" */
  targets: (string | SmartTarget)[];
  /** Output directory */
  outputDir?: string;
  /** Viewport size */
  viewport?: { width: number; height: number };
  /** Device scale factor for retina */
  deviceScaleFactor?: number;
  /** Dark mode */
  darkMode?: boolean;
  /** Wait time after page load (ms) */
  waitAfterLoad?: number;
  /** Also take a full-page screenshot */
  includeFullPage?: boolean;
  /** Maximum width for element screenshots (prevents ultra-wide captures) */
  maxWidth?: number;
  /** Maximum height for element screenshots */
  maxHeight?: number;
}

export interface DetectedFeature {
  name: string;
  pattern: string;
  selector: string;
  bounds: { x: number; y: number; width: number; height: number };
  matchMethod: 'selector' | 'text' | 'aria' | 'custom';
  confidence: 'high' | 'medium' | 'low';
}

export interface SmartScreenshotResult {
  success: boolean;
  url: string;
  screenshots: {
    feature: string;
    path: string;
    bounds: { x: number; y: number; width: number; height: number };
    matchMethod: string;
    confidence: string;
  }[];
  detected: DetectedFeature[];
  fullPage?: string;
  totalTime: string;
}

// ─── Main Function ────────────────────────────────────────────────────

export async function smartScreenshot(config: SmartScreenshotConfig): Promise<SmartScreenshotResult> {
  const {
    url,
    targets,
    outputDir = path.join(OUTPUT_DIR, 'smart-screenshots'),
    viewport = { width: 1920, height: 1080 },
    deviceScaleFactor = 1,
    darkMode = false,
    waitAfterLoad = 2000,
    includeFullPage = false,
    maxWidth = 1920,
    maxHeight = 2000,
  } = config;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const startTime = Date.now();
  let browser: Browser | undefined;

  try {
    logger.info(`Smart Screenshot: ${url}`);
    logger.info(`Targets: ${targets.map(t => typeof t === 'string' ? t : t.feature).join(', ')}`);

    // ─── 1. Launch Browser ──────────────────────────────────────
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--hide-scrollbars',
      ],
    });

    const context: BrowserContext = await browser.newContext({
      viewport,
      deviceScaleFactor,
      colorScheme: darkMode ? 'dark' : 'light',
    });

    const page: Page = await context.newPage();

    // ─── 2. Navigate ────────────────────────────────────────────
    logger.info(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });

    // Post-redirect guard: follow-the-redirect must not land on a private IP.
    const finalUrl = page.url();
    const finalGuard = guardFinalUrl(finalUrl);
    if (!finalGuard.ok) {
      throw new Error(`post-redirect check failed — final URL rejected: ${finalGuard.reason}`);
    }

    await page.waitForTimeout(waitAfterLoad);

    // ─── 3. Dismiss overlays ────────────────────────────────────
    await dismissOverlays(page);
    await page.waitForTimeout(500);

    // ─── 4. Pre-scroll to trigger lazy loading ──────────────────
    await preloadContent(page, viewport.height);

    // Hide scrollbar
    await page.addStyleTag({
      content: `::-webkit-scrollbar { display: none !important; } * { scrollbar-width: none !important; }`,
    });

    // ─── 5. Detect features ─────────────────────────────────────
    const normalizedTargets = normalizeTargets(targets);
    const isAutoDetect = normalizedTargets.some(t => t.feature === 'all');

    let detectedFeatures: DetectedFeature[];

    if (isAutoDetect) {
      logger.info('Auto-detecting all page features...');
      detectedFeatures = await detectAllFeatures(page, viewport);
    } else {
      detectedFeatures = [];
      for (const target of normalizedTargets) {
        const features = await detectFeature(page, target, viewport);
        detectedFeatures.push(...features);
      }
    }

    logger.info(`Detected ${detectedFeatures.length} features`);
    for (const f of detectedFeatures) {
      logger.info(`  ${f.name}: ${f.bounds.width}x${f.bounds.height} (${f.matchMethod}, ${f.confidence})`);
    }

    // ─── 6. Take screenshots ────────────────────────────────────
    const screenshots: SmartScreenshotResult['screenshots'] = [];
    const domain = new URL(url).hostname.replace(/^www\./, '').replace(/\./g, '-');

    for (let i = 0; i < detectedFeatures.length; i++) {
      const feature = detectedFeatures[i];
      const safeName = feature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
      const ssPath = path.join(outputDir, `${domain}-${safeName}-${i}.png`);

      try {
        // Scroll element into view
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
          }
        }, feature.selector);
        await page.waitForTimeout(300);

        // Get VIEWPORT-RELATIVE bounds (getBoundingClientRect without scrollY)
        const vpBounds = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }, feature.selector);
        if (!vpBounds || vpBounds.width < 10 || vpBounds.height < 10) {
          logger.info(`  Skipping ${feature.name}: element not found after scroll`);
          continue;
        }

        // Apply padding
        const padding = feature.pattern === 'custom' ? 20 : (findPattern(feature.pattern)?.padding ?? 20);
        const clip = {
          x: Math.max(0, vpBounds.x - padding),
          y: Math.max(0, vpBounds.y - padding),
          width: Math.min(vpBounds.width + padding * 2, maxWidth),
          height: Math.min(vpBounds.height + padding * 2, maxHeight),
        };

        // Ensure clip doesn't exceed viewport dimensions
        if (clip.x + clip.width > viewport.width) {
          clip.width = viewport.width - clip.x;
        }
        if (clip.y + clip.height > viewport.height) {
          clip.height = viewport.height - clip.y;
        }
        // Skip if clip is too small or invalid
        if (clip.width < 20 || clip.height < 20) {
          logger.info(`  Skipping ${feature.name}: clipped area too small`);
          continue;
        }

        await page.screenshot({
          path: ssPath,
          type: 'png',
          clip,
        });

        screenshots.push({
          feature: feature.name,
          path: ssPath,
          bounds: clip,
          matchMethod: feature.matchMethod,
          confidence: feature.confidence,
        });

        logger.info(`  Screenshot: ${feature.name} → ${path.basename(ssPath)}`);
      } catch (err) {
        logger.error(`  Failed to screenshot ${feature.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ─── 7. Full-page screenshot (optional) ─────────────────────
    let fullPagePath: string | undefined;
    if (includeFullPage) {
      fullPagePath = path.join(outputDir, `${domain}-full-page.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: fullPagePath, fullPage: true, type: 'png' });
      logger.info(`  Full-page screenshot → ${path.basename(fullPagePath)}`);
    }

    // ─── 8. Cleanup ─────────────────────────────────────────────
    await context.close();
    await browser.close();
    browser = undefined;

    const totalTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
    logger.info(`Smart Screenshot complete: ${screenshots.length} captures in ${totalTime}`);

    return {
      success: true,
      url,
      screenshots,
      detected: detectedFeatures,
      fullPage: fullPagePath,
      totalTime,
    };
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Smart Screenshot failed: ${message}`);
    throw new Error(`Smart Screenshot failed: ${message}`);
  }
}

// ─── Feature Detection ────────────────────────────────────────────────

function normalizeTargets(targets: (string | SmartTarget)[]): SmartTarget[] {
  return targets.map(t => {
    if (typeof t === 'string') {
      return { feature: t.toLowerCase().trim() };
    }
    return { ...t, feature: t.feature.toLowerCase().trim() };
  });
}

function findPattern(keyword: string): FeaturePattern | undefined {
  return FEATURE_PATTERNS.find(p =>
    p.keywords.some(k => k === keyword) ||
    p.name.toLowerCase() === keyword
  );
}

function findPatternsByKeyword(keyword: string): FeaturePattern[] {
  // Exact match first
  const exact = FEATURE_PATTERNS.filter(p =>
    p.keywords.some(k => k === keyword) ||
    p.name.toLowerCase() === keyword
  );
  if (exact.length > 0) return exact;

  // Fuzzy match: keyword is a substring of a pattern keyword or vice versa
  return FEATURE_PATTERNS.filter(p =>
    p.keywords.some(k => k.includes(keyword) || keyword.includes(k)) ||
    p.name.toLowerCase().includes(keyword) ||
    keyword.includes(p.name.toLowerCase())
  );
}

async function detectFeature(
  page: Page,
  target: SmartTarget,
  viewport: { width: number; height: number },
): Promise<DetectedFeature[]> {
  const results: DetectedFeature[] = [];

  // Custom selector override
  if (target.selector) {
    const bounds = await getElementBounds(page, target.selector);
    if (bounds && bounds.width > 10 && bounds.height > 10) {
      results.push({
        name: target.feature || 'Custom Element',
        pattern: 'custom',
        selector: target.selector,
        bounds,
        matchMethod: 'custom',
        confidence: 'high',
      });
    }
    return results;
  }

  // Feature keyword starts with . or # or [ → treat as CSS selector
  if (/^[.#\[]/.test(target.feature)) {
    const bounds = await getElementBounds(page, target.feature);
    if (bounds && bounds.width > 10 && bounds.height > 10) {
      results.push({
        name: target.feature,
        pattern: 'custom',
        selector: target.feature,
        bounds,
        matchMethod: 'custom',
        confidence: 'high',
      });
    }
    return results;
  }

  // Click to reveal if needed (e.g. chat widget)
  const patterns = findPatternsByKeyword(target.feature);
  if (patterns.length === 0) {
    logger.info(`  No pattern found for "${target.feature}", trying as text search...`);
    const textResults = await findByVisibleText(page, target.feature, viewport);
    results.push(...textResults);
    return results;
  }

  for (const pattern of patterns) {
    // Try reveal selector first (e.g. click to open chat)
    if ((target.revealFirst || pattern.revealSelector) && pattern.revealSelector) {
      try {
        const revealBtn = page.locator(pattern.revealSelector).first();
        if (await revealBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await revealBtn.click({ timeout: 2000 });
          await page.waitForTimeout(1000);
          logger.info(`  Clicked reveal button for ${pattern.name}`);
        }
      } catch { /* no reveal button found, continue */ }
    }

    // Try CSS selectors
    for (const selector of pattern.selectors) {
      const bounds = await getElementBounds(page, selector);
      if (bounds && meetsMinSize(bounds, pattern.minSize)) {
        results.push({
          name: pattern.name,
          pattern: pattern.keywords[0],
          selector,
          bounds,
          matchMethod: 'selector',
          confidence: 'high',
        });
        break; // Found via selector, no need to check more
      }
    }

    // If not found by selector, try text patterns
    if (results.filter(r => r.pattern === pattern.keywords[0]).length === 0) {
      for (const textPattern of pattern.textPatterns) {
        const textResults = await findSectionByText(page, textPattern, pattern.name, pattern.keywords[0], viewport);
        results.push(...textResults);
        if (textResults.length > 0) break;
      }
    }

    // Try ARIA roles
    if (results.filter(r => r.pattern === pattern.keywords[0]).length === 0) {
      for (const role of pattern.ariaRoles) {
        const ariaSelector = `[role="${role}"]`;
        const bounds = await getElementBounds(page, ariaSelector);
        if (bounds && meetsMinSize(bounds, pattern.minSize)) {
          results.push({
            name: pattern.name,
            pattern: pattern.keywords[0],
            selector: ariaSelector,
            bounds,
            matchMethod: 'aria',
            confidence: 'medium',
          });
          break;
        }
      }
    }
  }

  return results;
}

async function detectAllFeatures(
  page: Page,
  viewport: { width: number; height: number },
): Promise<DetectedFeature[]> {
  const results: DetectedFeature[] = [];
  const seenBounds = new Set<string>();

  for (const pattern of FEATURE_PATTERNS) {
    // Try each selector
    for (const selector of pattern.selectors) {
      const bounds = await getElementBounds(page, selector);
      if (bounds && meetsMinSize(bounds, pattern.minSize)) {
        const boundsKey = `${Math.round(bounds.x)}-${Math.round(bounds.y)}-${Math.round(bounds.width)}-${Math.round(bounds.height)}`;
        if (!seenBounds.has(boundsKey)) {
          seenBounds.add(boundsKey);
          results.push({
            name: pattern.name,
            pattern: pattern.keywords[0],
            selector,
            bounds,
            matchMethod: 'selector',
            confidence: 'high',
          });
          break; // One match per pattern
        }
      }
    }
  }

  return results;
}

async function findByVisibleText(
  page: Page,
  searchText: string,
  viewport: { width: number; height: number },
): Promise<DetectedFeature[]> {
  const results: DetectedFeature[] = [];
  const regex = new RegExp(searchText, 'i');

  const found = await findSectionByText(page, regex, searchText, searchText, viewport);
  results.push(...found);

  return results;
}

async function findSectionByText(
  page: Page,
  textPattern: RegExp,
  featureName: string,
  patternKey: string,
  _viewport: { width: number; height: number },
): Promise<DetectedFeature[]> {
  const results: DetectedFeature[] = [];

  // Find the nearest section/container that contains this text
  const element = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    // Search headings first, then paragraphs, then sections
    const candidates = [
      ...Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')),
      ...Array.from(document.querySelectorAll('section, [class*="section"], article')),
      ...Array.from(document.querySelectorAll('p, span, div')),
    ];

    for (const el of candidates) {
      const text = el.textContent?.trim() ?? '';
      if (re.test(text)) {
        // Walk up to find a meaningful container
        let container: Element = el;
        for (let i = 0; i < 5; i++) {
          const parent = container.parentElement;
          if (!parent || parent === document.body || parent === document.documentElement) break;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'section' || tag === 'article' || tag === 'main' ||
              parent.classList.toString().match(/section|container|wrapper|block|card/i)) {
            container = parent;
            break;
          }
          container = parent;
        }

        const rect = container.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 50) {
          // Generate a unique selector for this element
          let sel = container.tagName.toLowerCase();
          if (container.id) sel = `#${container.id}`;
          else if (container.className && typeof container.className === 'string') {
            const cls = container.className.split(/\s+/).filter(c => c.length > 0 && !c.includes(':'))[0];
            if (cls) sel = `.${cls}`;
          }

          return {
            selector: sel,
            bounds: {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height,
            },
          };
        }
      }
    }
    return null;
  }, textPattern.source);

  if (element) {
    results.push({
      name: featureName,
      pattern: patternKey,
      selector: element.selector,
      bounds: element.bounds,
      matchMethod: 'text',
      confidence: 'medium',
    });
  }

  return results;
}

// ─── DOM Helpers ──────────────────────────────────────────────────────

async function getElementBounds(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    }, selector);
  } catch {
    return null;
  }
}

function meetsMinSize(
  bounds: { width: number; height: number },
  minSize?: { width: number; height: number },
): boolean {
  if (!minSize) return bounds.width > 10 && bounds.height > 10;
  return bounds.width >= minSize.width && bounds.height >= minSize.height;
}

// ─── Page Preparation ─────────────────────────────────────────────────

async function dismissOverlays(page: Page): Promise<void> {
  // Set consent cookies
  await page.evaluate(() => {
    localStorage.setItem('cookie-consent', 'accepted');
    localStorage.setItem('cookieConsent', 'accepted');
    localStorage.setItem('cookie_consent', 'true');
    localStorage.setItem('cookies-accepted', 'true');
    localStorage.setItem('gdpr-consent', 'true');
    localStorage.setItem('CookieConsent', 'true');
    document.cookie = 'cookie-consent=accepted; path=/; max-age=31536000';
    window.dispatchEvent(new Event('cookie-consent-accepted'));
  });

  await page.waitForTimeout(300);

  // Click accept buttons
  for (const text of ['Akzeptieren', 'Accept', 'Alle akzeptieren', 'Accept all', 'OK', 'Verstanden']) {
    try {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
        await btn.click({ timeout: 1000 });
        break;
      }
    } catch { /* next */ }
  }

  // Force-hide common overlay selectors
  await page.addStyleTag({
    content: `
      [class*="cookie"], [class*="Cookie"],
      [class*="consent"], [class*="Consent"],
      [id*="cookie"], [id*="consent"],
      [role="dialog"],
      .fixed.bottom-0.left-0.right-0.z-50 {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function preloadContent(page: Page, viewportHeight: number): Promise<void> {
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = Math.ceil(scrollHeight / (viewportHeight * 0.7));

  for (let i = 0; i <= steps; i++) {
    const y = Math.min(i * viewportHeight * 0.7, scrollHeight);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(150);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}
