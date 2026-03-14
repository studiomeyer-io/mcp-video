/**
 * Scene execution engine — processes scene definitions into frame captures
 */

import type { Page } from 'playwright';
import type { Scene, ScrollScene, HoverScene, ClickScene, TypeScene, WaitScene, EasingName } from './types.js';
import { applyEasing } from './easing.js';
import { moveCursorToElement, animateClick } from './cursor.js';
import { logger } from '../../lib/logger.js';

interface FrameCallback {
  (frameIndex: number): Promise<void>;
}

/**
 * Execute all scenes and capture frames
 */
export async function executeScenes(
  page: Page,
  scenes: Scene[],
  fps: number,
  captureFrame: FrameCallback,
  cursorEnabled: boolean
): Promise<number> {
  let totalFramesCaptured = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    logger.info(`Scene ${i + 1}/${scenes.length}: ${scene.type}`);

    let framesInScene = 0;

    switch (scene.type) {
      case 'scroll':
        framesInScene = await executeScrollScene(page, scene, fps, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;

      case 'pause':
        framesInScene = await executePauseScene(page, scene.duration, fps, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;

      case 'hover':
        framesInScene = await executeHoverScene(page, scene, fps, cursorEnabled, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;

      case 'click':
        framesInScene = await executeClickScene(page, scene, fps, cursorEnabled, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;

      case 'type':
        framesInScene = await executeTypeScene(page, scene, fps, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;

      case 'wait':
        framesInScene = await executeWaitScene(page, scene, fps, async (fi) => {
          await captureFrame(totalFramesCaptured + fi);
        });
        break;
    }

    totalFramesCaptured += framesInScene;
    logger.debug(`Scene ${i + 1} captured ${framesInScene} frames (total: ${totalFramesCaptured})`);
  }

  return totalFramesCaptured;
}

/**
 * Execute a scroll scene — the core of cinema-quality videos
 */
async function executeScrollScene(
  page: Page,
  scene: ScrollScene,
  fps: number,
  captureFrame: FrameCallback
): Promise<number> {
  const easingName: EasingName = scene.easing ?? 'easeInOutCubic';
  const totalFrames = Math.ceil(scene.duration * fps);

  // Resolve scroll target
  const scrollInfo = await page.evaluate((target) => {
    const docHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const currentScroll = window.scrollY;
    const maxScroll = Math.max(0, docHeight - viewportHeight);

    if (target === 'bottom') return { from: currentScroll, to: maxScroll };
    if (target === 'top') return { from: currentScroll, to: 0 };
    if (typeof target === 'number') return { from: currentScroll, to: Math.min(target, maxScroll) };

    // CSS selector — scroll to element
    const el = document.querySelector(target);
    if (el) {
      const rect = el.getBoundingClientRect();
      const targetY = Math.min(currentScroll + rect.top - 100, maxScroll);
      return { from: currentScroll, to: targetY };
    }

    return { from: currentScroll, to: maxScroll };
  }, scene.to);

  const scrollDistance = scrollInfo.to - scrollInfo.from;

  for (let frame = 0; frame <= totalFrames; frame++) {
    const progress = frame / totalFrames;
    const easedScroll = scrollInfo.from + applyEasing(progress, scrollDistance, easingName);

    await page.evaluate((y) => window.scrollTo(0, y), easedScroll);

    // Small delay to let scroll-triggered animations render
    await page.waitForTimeout(8);

    await captureFrame(frame);
  }

  return totalFrames + 1;
}

/**
 * Execute a pause scene — captures static frames
 */
async function executePauseScene(
  _page: Page,
  duration: number,
  fps: number,
  captureFrame: FrameCallback
): Promise<number> {
  const totalFrames = Math.ceil(duration * fps);

  for (let frame = 0; frame < totalFrames; frame++) {
    await captureFrame(frame);
  }

  return totalFrames;
}

/**
 * Execute a hover scene — move cursor to element and hold
 */
async function executeHoverScene(
  page: Page,
  scene: HoverScene,
  fps: number,
  cursorEnabled: boolean,
  captureFrame: FrameCallback
): Promise<number> {
  let frameCount = 0;

  // Move cursor to element (animated)
  if (cursorEnabled && scene.animateCursor !== false) {
    const moveDuration = 600; // ms
    const moveFrames = Math.ceil((moveDuration / 1000) * fps);

    await moveCursorToElement(page, scene.selector, moveDuration, fps);

    // Capture frames during cursor movement — take snapshots
    for (let i = 0; i < moveFrames; i++) {
      await captureFrame(frameCount++);
    }
  } else {
    // Instant hover
    const pos = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, scene.selector);

    if (pos) {
      await page.mouse.move(pos.x, pos.y);
    }
  }

  // Hold hover — capture frames
  const holdFrames = Math.ceil(scene.duration * fps);
  for (let i = 0; i < holdFrames; i++) {
    await captureFrame(frameCount++);
  }

  return frameCount;
}

/**
 * Execute a click scene
 */
async function executeClickScene(
  page: Page,
  scene: ClickScene,
  fps: number,
  cursorEnabled: boolean,
  captureFrame: FrameCallback
): Promise<number> {
  let frameCount = 0;

  // Move cursor to element
  if (cursorEnabled) {
    const moveFrames = Math.ceil(0.5 * fps);
    await moveCursorToElement(page, scene.selector, 500, fps);
    for (let i = 0; i < moveFrames; i++) {
      await captureFrame(frameCount++);
    }
  }

  // Click animation
  if (cursorEnabled) {
    await animateClick(page);
  }

  // Actual click
  await page.click(scene.selector);

  // Wait for navigation/content
  if (scene.waitFor === 'networkidle') {
    await page.waitForLoadState('networkidle').catch(() => {});
  } else if (scene.waitFor === 'load') {
    await page.waitForLoadState('load').catch(() => {});
  } else if (typeof scene.waitFor === 'number') {
    await page.waitForTimeout(scene.waitFor);
  }

  // Pause after click
  const pauseDuration = scene.pauseAfter ?? 1;
  const pauseFrames = Math.ceil(pauseDuration * fps);
  for (let i = 0; i < pauseFrames; i++) {
    await captureFrame(frameCount++);
  }

  return frameCount;
}

/**
 * Execute a type scene
 */
async function executeTypeScene(
  page: Page,
  scene: TypeScene,
  fps: number,
  captureFrame: FrameCallback
): Promise<number> {
  let frameCount = 0;
  const delay = scene.delay ?? 80;
  const framesPerKeystroke = Math.max(1, Math.ceil((delay / 1000) * fps));

  // Focus the input
  await page.click(scene.selector);
  await captureFrame(frameCount++);

  // Type character by character
  for (const char of scene.text) {
    await page.keyboard.type(char, { delay: 0 });

    for (let i = 0; i < framesPerKeystroke; i++) {
      await captureFrame(frameCount++);
    }
  }

  return frameCount;
}

/**
 * Execute a wait scene — wait for selector, capturing frames
 */
async function executeWaitScene(
  page: Page,
  scene: WaitScene,
  fps: number,
  captureFrame: FrameCallback
): Promise<number> {
  const timeout = scene.timeout ?? 5000;
  const maxFrames = Math.ceil((timeout / 1000) * fps);
  let frameCount = 0;

  const waitPromise = page.waitForSelector(scene.selector, { timeout }).catch(() => null);

  // Capture frames while waiting
  const startTime = Date.now();
  while (Date.now() - startTime < timeout && frameCount < maxFrames) {
    await captureFrame(frameCount++);
    await page.waitForTimeout(Math.floor(1000 / fps));

    // Check if element appeared
    const found = await page.$(scene.selector);
    if (found) break;
  }

  await waitPromise;
  return frameCount;
}

/**
 * Create default scenes for a simple scroll-through video
 */
export function createDefaultScenes(scrollDuration: number = 18): Scene[] {
  return [
    { type: 'pause', duration: 1.5 },
    { type: 'scroll', to: 'bottom', duration: scrollDuration, easing: 'showcase' },
    { type: 'pause', duration: 2 },
  ];
}
