/**
 * ffmpeg hardening — protocol whitelist + argument validation.
 *
 * Two distinct threats:
 *   1. ffmpeg can follow URLs inside HLS/DASH playlists and fetch any
 *      protocol ffmpeg was built with (file://, http, rtsp, tcp, udp...).
 *      A playlist from an attacker-controlled HTTPS host can reference
 *      `http://169.254.169.254/latest/meta-data/` and exfiltrate cloud
 *      credentials. We counter by passing -protocol_whitelist on every
 *      invocation, restricting ffmpeg to the smallest set of protocols
 *      the caller actually needs.
 *   2. Any user-controlled path string that starts with `-` is treated
 *      by ffmpeg as a flag, not a filename. A caller passing
 *      `-i /etc/passwd -frames:v 1 -f image2` as "filename" can hijack
 *      the command. We forbid leading `-` on any input/output path.
 */

export type FfmpegProtocolSet = 'local-only' | 'https-input' | 'https-and-hls';

const PROTOCOL_SETS: Record<FfmpegProtocolSet, string> = {
  // Pure file-to-file work: editing, color, concat, audio mix, chroma.
  'local-only': 'file,pipe,crypto,cache,fd',
  // ffmpeg can fetch the top-level https input but cannot follow HLS segment
  // lists or reference any other protocol. Use when ONE https URL is the input.
  'https-input': 'file,pipe,crypto,cache,fd,https,tls,tcp',
  // HLS master+segment playback. Still refuses http (only https), file schemes
  // and 169.254.x.x metadata (those need to be caught upstream by url-guard).
  'https-and-hls': 'file,pipe,crypto,cache,fd,https,tls,tcp,hls,applehttp',
};

/**
 * Prepend `-protocol_whitelist <set>` to ffmpeg args.
 *
 * Callers should use 'local-only' unless they genuinely need network.
 * Position matters: ffmpeg only honours -protocol_whitelist when it appears
 * before any `-i` input that would use it, so we always prepend.
 */
export function buildFfmpegArgs(
  userArgs: string[],
  protocols: FfmpegProtocolSet = 'local-only'
): string[] {
  if (!Array.isArray(userArgs)) {
    throw new TypeError('ffmpeg args must be an array of strings');
  }
  return ['-protocol_whitelist', PROTOCOL_SETS[protocols], ...userArgs];
}

/**
 * Validate a user-supplied path that will be passed to ffmpeg as -i or output.
 * Returns the sanitized path or throws. Rejects leading `-` (flag injection),
 * empty strings, and values containing NUL bytes.
 */
export function validateFfmpegPath(p: unknown, label = 'path'): string {
  if (typeof p !== 'string' || p.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (p.startsWith('-')) {
    throw new Error(`${label} must not start with "-" (looks like a flag)`);
  }
  if (p.includes('\0')) {
    throw new Error(`${label} must not contain null bytes`);
  }
  return p;
}

/**
 * Validate every entry in an args array used as ffmpeg filename-like tokens.
 * Pass the list of indices that are user-controlled paths; other args
 * (built by the caller with known flags) are not touched.
 */
export function validateFfmpegPaths(
  args: string[],
  userControlledIndices: number[],
  label = 'path'
): void {
  for (const i of userControlledIndices) {
    validateFfmpegPath(args[i], `${label}[${i}]`);
  }
}
