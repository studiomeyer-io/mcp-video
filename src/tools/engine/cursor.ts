/**
 * Cursor simulation — injects a visible, smooth cursor into the page
 * Uses Bézier curves for natural-looking mouse movement
 */

import type { Page } from 'playwright';
import type { CursorConfig } from './types.js';

const DEFAULT_CURSOR: Required<CursorConfig> = {
  enabled: true,
  style: 'dot',
  color: 'rgba(255, 255, 255, 0.9)',
  size: 20,
  clickAnimation: true,
};

/**
 * Inject a visible cursor overlay into the page
 */
export async function injectCursor(
  page: Page,
  config: Partial<CursorConfig> = {}
): Promise<void> {
  const opts = { ...DEFAULT_CURSOR, ...config };
  if (!opts.enabled) return;

  await page.evaluate(
    ({ style, color, size, clickAnimation }) => {
      // Create cursor element
      const cursor = document.createElement('div');
      cursor.id = '__cinema-cursor';

      const isArrow = style === 'arrow' || style === 'pointer';

      if (isArrow) {
        // SVG arrow cursor
        cursor.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
        </svg>`;
        Object.assign(cursor.style, {
          position: 'fixed',
          zIndex: '2147483647',
          pointerEvents: 'none',
          left: '-100px',
          top: '-100px',
          transition: 'none',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        });
      } else {
        // Dot cursor
        Object.assign(cursor.style, {
          position: 'fixed',
          zIndex: '2147483647',
          pointerEvents: 'none',
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          backgroundColor: color,
          border: '2px solid rgba(0,0,0,0.2)',
          boxShadow: '0 0 12px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1)',
          left: '-100px',
          top: '-100px',
          transform: 'translate(-50%, -50%)',
          transition: 'none',
        });
      }

      document.body.appendChild(cursor);

      // Click animation ring
      if (clickAnimation) {
        const ring = document.createElement('div');
        ring.id = '__cinema-cursor-ring';
        Object.assign(ring.style, {
          position: 'fixed',
          zIndex: '2147483646',
          pointerEvents: 'none',
          width: `${size * 2.5}px`,
          height: `${size * 2.5}px`,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          left: '-100px',
          top: '-100px',
          transform: 'translate(-50%, -50%) scale(0)',
          opacity: '0',
          transition: 'none',
        });
        document.body.appendChild(ring);
      }

      // Store config on window for later use
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__cinemaCursorConfig = { style, color, size, clickAnimation };
    },
    opts
  );
}

/**
 * Move cursor to a specific position with smooth Bézier interpolation
 */
export async function moveCursor(
  page: Page,
  targetX: number,
  targetY: number,
  duration: number = 800,
  fps: number = 60
): Promise<void> {
  const frames = Math.max(1, Math.ceil((duration / 1000) * fps));

  // Get current cursor position
  const startPos = await page.evaluate(() => {
    const cursor = document.getElementById('__cinema-cursor');
    if (!cursor) return { x: 0, y: 0 };
    return {
      x: parseFloat(cursor.style.left) || 0,
      y: parseFloat(cursor.style.top) || 0,
    };
  });

  // Generate Bézier control points for natural movement
  const dx = targetX - startPos.x;
  const dy = targetY - startPos.y;
  const cp1x = startPos.x + dx * 0.3 + (Math.random() - 0.5) * Math.abs(dx) * 0.2;
  const cp1y = startPos.y + dy * 0.1 + (Math.random() - 0.5) * Math.abs(dy) * 0.3;
  const cp2x = startPos.x + dx * 0.7 + (Math.random() - 0.5) * Math.abs(dx) * 0.15;
  const cp2y = startPos.y + dy * 0.9 + (Math.random() - 0.5) * Math.abs(dy) * 0.2;

  // Animate through Bézier curve
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    // Ease the t parameter for acceleration/deceleration
    const et = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    // Cubic Bézier
    const mt = 1 - et;
    const x = mt * mt * mt * startPos.x +
              3 * mt * mt * et * cp1x +
              3 * mt * et * et * cp2x +
              et * et * et * targetX;
    const y = mt * mt * mt * startPos.y +
              3 * mt * mt * et * cp1y +
              3 * mt * et * et * cp2y +
              et * et * et * targetY;

    await page.evaluate(
      ({ x, y }) => {
        const cursor = document.getElementById('__cinema-cursor');
        if (cursor) {
          cursor.style.left = `${x}px`;
          cursor.style.top = `${y}px`;
        }
      },
      { x: Math.round(x), y: Math.round(y) }
    );

    // Also move the actual mouse for hover effects
    await page.mouse.move(Math.round(x), Math.round(y));
  }
}

/**
 * Move cursor to a CSS selector's center
 */
export async function moveCursorToElement(
  page: Page,
  selector: string,
  duration: number = 800,
  fps: number = 60
): Promise<void> {
  const pos = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, selector);

  if (pos) {
    await moveCursor(page, pos.x, pos.y, duration, fps);
  }
}

/**
 * Animate a click effect at current cursor position
 */
export async function animateClick(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ring = document.getElementById('__cinema-cursor-ring');
    const cursor = document.getElementById('__cinema-cursor');
    if (!ring || !cursor) return;

    ring.style.left = cursor.style.left;
    ring.style.top = cursor.style.top;
    ring.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
    ring.style.transform = 'translate(-50%, -50%) scale(0)';
    ring.style.opacity = '1';

    // Trigger animation
    requestAnimationFrame(() => {
      ring.style.transform = 'translate(-50%, -50%) scale(1)';
      ring.style.opacity = '0';
    });
  });

  // Wait for animation
  await new Promise((r) => setTimeout(r, 450));
}

/**
 * Hide cursor (move off-screen)
 */
export async function hideCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cursor = document.getElementById('__cinema-cursor');
    const ring = document.getElementById('__cinema-cursor-ring');
    if (cursor) cursor.style.left = '-100px';
    if (ring) ring.style.left = '-100px';
  });
}
