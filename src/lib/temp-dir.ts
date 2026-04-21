/**
 * Safe temp directory helper.
 *
 * Motivation: many engines create predictable paths like
 * `/tmp/narrated-video-${Date.now()}` which (a) race when two invocations
 * hit the same millisecond, (b) leak state when the process crashes before
 * the manual cleanup runs, and (c) are trivially overwritable by a local
 * attacker who can guess the pattern.
 *
 * `withTempDir` uses `fs.mkdtemp` (unique suffix from the kernel) and
 * always cleans up via try/finally.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logger } from './logger.js';

/**
 * Create a unique temp directory, pass it to `fn`, then clean up.
 * Cleanup runs even if `fn` throws. Cleanup errors are logged but never
 * re-thrown — the original error from `fn` always wins.
 */
export async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const base = join(tmpdir(), sanitizePrefix(prefix));
  const dir = await mkdtemp(base);
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((err) => {
      logger.warn(`temp-dir cleanup failed for ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

/**
 * Low-level: just create a unique temp directory, return the path.
 * The caller is responsible for cleanup — prefer `withTempDir` when
 * the lifetime is scoped to one function.
 */
export async function makeTempDir(prefix: string): Promise<string> {
  const base = join(tmpdir(), sanitizePrefix(prefix));
  return mkdtemp(base);
}

function sanitizePrefix(prefix: string): string {
  // Kill `..` sequences first so a caller can't build a traversal-looking
  // literal segment (the join() to tmpdir() already makes traversal
  // impossible, but we still prefer tidy paths for ops + audit logs).
  const noTraversal = prefix.replace(/\.{2,}/g, '-');
  const safe = noTraversal.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 32);
  // mkdtemp appends 6 random chars; ensure we end with a `-` so the
  // generated suffix stays visually separated.
  return safe.endsWith('-') ? safe : `${safe}-`;
}
