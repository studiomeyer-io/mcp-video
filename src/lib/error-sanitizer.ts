/**
 * Error-message sanitizer for upstream API responses.
 *
 * Motivation: TTS, cloud-media and similar APIs echo request bodies or
 * auth headers back in error responses. Our code previously did
 *   throw new Error(`ElevenLabs API ${status}: ${errorText}`);
 * which happily embedded Bearer tokens, full xi-api-key values, signed
 * URLs and sometimes the caller's text payload into stack traces that
 * the MCP client then logged or surfaced to the human.
 *
 * `sanitizeErrorMessage` strips the common secret-looking patterns and
 * truncates to a fixed cap so a 2 MB HTML error page doesn't turn into
 * a 2 MB thrown string.
 */

// Order matters: specific-form patterns (Bearer / sk- / AKIA) run first and
// leave `[REDACTED]` markers behind. The generic Authorization pattern has
// a negative lookahead for `Bearer` / `[REDACTED]` so it does not re-consume
// an already-tokenised value (which would lose the `Bearer` marker that
// log-readers rely on to see *what kind* of token leaked).
const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // Bearer tokens — `Bearer sk-abc...`
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: 'Bearer [REDACTED]' },
  // ElevenLabs `xi-api-key`, standard `x-api-key` (AWS / Anthropic / many APIs)
  { re: /(xi?-api-key["':\s]+)[^"'\s,}]+/gi, replacement: '$1[REDACTED]' },
  // OpenAI-style `sk-` and `sk-proj-` keys
  { re: /\bsk-[a-zA-Z0-9_-]{20,}/g, replacement: 'sk-[REDACTED]' },
  // AWS access keys (AKIA + 16 chars)
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED-AWS-KEY]' },
  // Generic `"api_key": "..."` or `"apiKey": "..."` inside JSON
  { re: /("api[-_]?key"\s*:\s*")[^"]+/gi, replacement: '$1[REDACTED]' },
  // Authorization header full line — skip values we already redacted.
  {
    re: /(authorization["':\s]+)(?!Bearer\s)(?!\[REDACTED\])[^"'\s,}]+/gi,
    replacement: '$1[REDACTED]',
  },
  // Signed URLs with `X-Amz-Signature=` or `?signature=`
  { re: /([?&](?:X-Amz-Signature|signature)=)[^&\s"']+/gi, replacement: '$1[REDACTED]' },
];

export interface SanitizeOptions {
  /** Max length of the returned string (default: 300). */
  limit?: number;
  /** Optional prefix added before the sanitized body. */
  prefix?: string;
}

export function sanitizeErrorMessage(raw: unknown, opts: SanitizeOptions = {}): string {
  const { limit = 300, prefix = '' } = opts;
  let str = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw);
  for (const { re, replacement } of PATTERNS) {
    str = str.replace(re, replacement);
  }
  // Collapse whitespace for readability.
  str = str.replace(/\s+/g, ' ').trim();
  if (str.length > limit) str = `${str.slice(0, limit)}…`;
  return prefix ? `${prefix}${str}` : str;
}

/**
 * Wrap a thrown non-Error value and return a sanitized Error.
 * Use inside catch-blocks that re-throw upstream API failures.
 */
export function sanitizedError(raw: unknown, prefix = ''): Error {
  return new Error(sanitizeErrorMessage(raw, { prefix }));
}
