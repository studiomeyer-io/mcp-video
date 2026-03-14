/**
 * Cinema-grade easing functions for smooth scroll animations
 * All functions: t ∈ [0,1] → output ∈ [0,1]
 */

import type { EasingName } from './types.js';

// ─── Core Easing Functions ──────────────────────────────────────────

const linear = (t: number): number => t;

const easeInQuad = (t: number): number => t * t;
const easeOutQuad = (t: number): number => t * (2 - t);
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

const easeInCubic = (t: number): number => t * t * t;
const easeOutCubic = (t: number): number => (--t) * t * t + 1;
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const easeInQuart = (t: number): number => t * t * t * t;
const easeOutQuart = (t: number): number => 1 - (--t) * t * t * t;
const easeInOutQuart = (t: number): number =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

const easeInQuint = (t: number): number => t * t * t * t * t;
const easeOutQuint = (t: number): number => 1 + (--t) * t * t * t * t;
const easeInOutQuint = (t: number): number =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

const easeInOutSine = (t: number): number =>
  -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Cinematic easing: slow start (15%), smooth cruise (70%), slow end (15%)
 * Uses quintic in/out for dramatic deceleration at edges
 */
const cinematic = (t: number): number => {
  if (t < 0.15) {
    // Slow ease-in (quintic)
    const local = t / 0.15;
    return 0.15 * (local * local * local);
  } else if (t > 0.85) {
    // Slow ease-out (quintic)
    const local = (t - 0.85) / 0.15;
    return 0.85 + 0.15 * (1 - Math.pow(1 - local, 3));
  } else {
    // Linear cruise in the middle
    const local = (t - 0.15) / 0.70;
    return 0.15 + 0.70 * local;
  }
};

/**
 * Showcase easing: dramatic slow start, buttery cruise, elegant deceleration
 * Designed specifically for portfolio showcase videos
 *
 * Distribution: 25% slow start → 50% smooth cruise → 25% slow end
 * The cruise section uses easeInOutSine for a gentle wave-like motion
 * that never feels rushed — perfect for long pages
 */
const showcase = (t: number): number => {
  if (t < 0.25) {
    // Very slow ease-in (quintic for dramatic slowness)
    const local = t / 0.25;
    return 0.08 * easeInQuint(local);
  } else if (t > 0.75) {
    // Very slow ease-out (quintic for elegant stop)
    const local = (t - 0.75) / 0.25;
    return 0.92 + 0.08 * easeOutQuint(local);
  } else {
    // Smooth cruise in the middle — easeInOutSine for wave-like feel
    const local = (t - 0.25) / 0.50;
    return 0.08 + 0.84 * easeInOutSine(local);
  }
};

// ─── Easing Registry ────────────────────────────────────────────────

const EASINGS: Record<EasingName, (t: number) => number> = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInOutSine,
  cinematic,
  showcase,
};

/**
 * Get an easing function by name
 */
export function getEasing(name: EasingName): (t: number) => number {
  return EASINGS[name] ?? EASINGS.easeInOutCubic;
}

/**
 * Apply easing to a progress value and map to a range
 */
export function applyEasing(
  progress: number,
  totalDistance: number,
  easingName: EasingName = 'easeInOutCubic'
): number {
  const easingFn = getEasing(easingName);
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.round(easingFn(clamped) * totalDistance);
}

export { EASINGS };
