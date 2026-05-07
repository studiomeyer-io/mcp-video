/**
 * Cross-platform ffmpeg / ffprobe locator.
 *
 * Background: the previous startup check used `which ffmpeg`, which is a
 * Unix-only command. On Windows the equivalent is `where`, and even that is
 * brittle (extension resolution, PATHEXT, spaces in paths). Worse, the legacy
 * runtime spawn sites called `execFile('ffmpeg', ...)` directly without
 * honouring an override path, so setting `FFMPEG_PATH` in the environment did
 * nothing at runtime — the env var was advertised in error messages but never
 * actually read.
 *
 * This module fixes both problems with one helper:
 *
 *   1. `resolveFfmpegBin(name)` returns the configured override
 *      (`FFMPEG_PATH` / `FFPROBE_PATH`) if set, otherwise the bare binary
 *      name. Node's `execFile` resolves bare names through PATH on every
 *      OS — including Windows PATHEXT (.exe / .bat).
 *
 *   2. `assertFfmpegBinAvailable(name)` proves the binary actually runs by
 *      invoking `<bin> -version` once at startup. No shell, no `which`/`where`
 *      indirection. Works on Linux, macOS, Windows.
 *
 * Both runtime spawn sites (server.ts startup check + ffmpeg-run.ts spawn)
 * MUST go through this module so the override stays consistent.
 */

import { execFileSync } from 'node:child_process';

export type FfmpegBin = 'ffmpeg' | 'ffprobe';

const ENV_VAR: Record<FfmpegBin, 'FFMPEG_PATH' | 'FFPROBE_PATH'> = {
  ffmpeg: 'FFMPEG_PATH',
  ffprobe: 'FFPROBE_PATH',
};

/**
 * Returns the path / name to invoke for the given binary. Prefers the
 * `FFMPEG_PATH` / `FFPROBE_PATH` environment variable (trimmed) if set;
 * otherwise falls back to the bare binary name and relies on PATH resolution.
 *
 * Pure function — does not touch the filesystem or spawn anything. Read every
 * call so a process that mutates env vars at runtime sees the new value.
 */
export function resolveFfmpegBin(name: FfmpegBin): string {
  const envName = ENV_VAR[name];
  const override = process.env[envName];
  if (typeof override === 'string') {
    const trimmed = override.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return name;
}

/**
 * Returns the env-var key associated with a binary, for use in error messages
 * and diagnostics. Centralised so the names cannot drift.
 */
export function envVarFor(name: FfmpegBin): 'FFMPEG_PATH' | 'FFPROBE_PATH' {
  return ENV_VAR[name];
}

export interface BinaryProbeResult {
  ok: boolean;
  /** First line of the resolved binary's `-version` output (truncated). */
  versionLine?: string;
  /** Plain reason the binary could not be invoked. Never includes the env value. */
  reason?: string;
  /** What was actually invoked (env-override or bare name). */
  resolved: string;
}

/**
 * Probes the binary by invoking `<bin> -version`. Returns a structured result
 * instead of throwing so callers can decide how to surface the failure
 * (startup-exit vs. lazy retry vs. tool-error).
 *
 * Hidden console window on Windows via `windowsHide: true`. Stdio piped so
 * version banners do not leak into MCP stdout.
 */
export function probeFfmpegBin(name: FfmpegBin): BinaryProbeResult {
  const resolved = resolveFfmpegBin(name);
  try {
    const out = execFileSync(resolved, ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 5_000,
    });
    const firstLine = out.toString('utf8').split(/\r?\n/, 1)[0]?.trim();
    return { ok: true, versionLine: firstLine?.slice(0, 200), resolved };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: reason.slice(0, 300), resolved };
  }
}

/**
 * Probes a binary and throws a friendly error if it is not invokable. The
 * thrown message tells the operator exactly which env var to set. Caller is
 * responsible for catching + exiting (server.ts does that at startup).
 */
export function assertFfmpegBinAvailable(name: FfmpegBin): void {
  const result = probeFfmpegBin(name);
  if (result.ok) return;

  const envName = envVarFor(name);
  const isOverride = result.resolved !== name;
  const tail = isOverride
    ? `${envName} is set to "${result.resolved}" but the binary cannot be executed (reason: ${result.reason ?? 'unknown'}).`
    : `Install ffmpeg: https://ffmpeg.org/download.html — or set ${envName}=<path-to-binary> if it is installed elsewhere.`;
  throw new Error(`${name} not found. ${tail}`);
}
