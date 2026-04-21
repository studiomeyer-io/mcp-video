/**
 * Central ffmpeg runner — every engine should use this instead of calling
 * `execFile('ffmpeg', args, ...)` directly. Two reasons:
 *
 *   1. We inject `-protocol_whitelist` on every call (see ffmpeg-safety.ts).
 *      Without it, an HLS playlist — or a user-provided "inputPath" that is
 *      secretly an `https://` URL — lets ffmpeg fetch any protocol it was
 *      built against, including `file://`, which means SSRF to the local
 *      filesystem or to AWS/GCP metadata endpoints.
 *
 *   2. We sanitize stderr before it lands in logs or thrown messages.
 *      ffmpeg will happily echo signed URLs, Authorization headers and
 *      API keys from failed HTTP fetches.
 *
 * Callers pass their own `maxBuffer`/`timeout`/`protocols` as needed.
 */

import { execFile } from 'node:child_process';
import { logger } from './logger.js';
import { buildFfmpegArgs, type FfmpegProtocolSet } from './ffmpeg-safety.js';
import { sanitizeErrorMessage } from './error-sanitizer.js';

export interface FfmpegRunOptions {
  /** Bytes of stdout+stderr buffered before killing the process. Default: 50 MB. */
  maxBuffer?: number;
  /** Kill-after timeout in ms. Default: no timeout (ffmpeg exits on its own). */
  timeoutMs?: number;
  /** Which ffmpeg protocols to permit. Default: 'local-only' (file + pipe). */
  protocols?: FfmpegProtocolSet;
  /** Optional label used in the rejection reason, e.g. "lut-preset" */
  label?: string;
}

/**
 * Some callers (beat-sync, filter pipelines) need stderr because ffmpeg
 * prints filter-graph info and stream metadata there. Pass `'stderr'` as
 * the third arg to resolve with stderr instead of stdout. Defaults to stdout.
 */
export function runFfmpeg(
  args: string[],
  opts: FfmpegRunOptions = {},
  resolver: 'stdout' | 'stderr' = 'stdout'
): Promise<string> {
  const {
    maxBuffer = 50 * 1024 * 1024,
    timeoutMs,
    protocols = 'local-only',
    label = 'ffmpeg',
  } = opts;
  const safeArgs = buildFfmpegArgs(args, protocols);

  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      safeArgs,
      { maxBuffer, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          const safeMsg = sanitizeErrorMessage(stderr || error.message);
          logger.error(`${label} failed: ${safeMsg}`);
          reject(new Error(`${label} failed: ${safeMsg}`));
          return;
        }
        resolve(resolver === 'stderr' ? stderr : stdout);
      }
    );
  });
}

/**
 * ffprobe runner — same protocol-whitelist + stderr-sanitize discipline as
 * runFfmpeg. ffprobe silently follows HLS/DASH playlists the same way ffmpeg
 * does, so every `execFile('ffprobe', args, ...)` must go through here or
 * the SSRF hardening has a bypass via "just probe the file first".
 *
 * Default resolver is stdout because ffprobe's `-show_entries …` + `-of …`
 * output is what callers need. stderr is error-only.
 */
export function runFfprobe(
  args: string[],
  opts: FfmpegRunOptions = {},
  resolver: 'stdout' | 'stderr' = 'stdout'
): Promise<string> {
  const {
    maxBuffer = 10 * 1024 * 1024,
    timeoutMs,
    protocols = 'local-only',
    label = 'ffprobe',
  } = opts;
  // ffprobe honours the same -protocol_whitelist flag as ffmpeg.
  const safeArgs = buildFfmpegArgs(args, protocols);

  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      safeArgs,
      { maxBuffer, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          const safeMsg = sanitizeErrorMessage(stderr || error.message);
          logger.error(`${label} failed: ${safeMsg}`);
          reject(new Error(`${label} failed: ${safeMsg}`));
          return;
        }
        resolve(resolver === 'stderr' ? stderr : stdout);
      }
    );
  });
}
