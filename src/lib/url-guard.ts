/**
 * URL safety guard for any tool that fetches/navigates user-supplied URLs.
 *
 * Blocks the two classes of SSRF abuse that are easy to stumble into when
 * an AI assistant can ask the server to open arbitrary URLs:
 *   1. Non-http(s) schemes (file://, ftp://, gopher://, data: etc.)
 *   2. Loopback + link-local + RFC1918 + cloud metadata endpoints
 *
 * Opt-in escape hatch for local dev: set MCP_VIDEO_ALLOW_INTERNAL=1.
 */

export type UrlGuardResult = { ok: true; url: string } | { ok: false; reason: string };

const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^(?:127|10)\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./, // link-local + AWS/GCP/Azure metadata (169.254.169.254)
  /^0\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i, // IPv6 unique-local
  /^fe80:/i, // IPv6 link-local
  /^\[/, // any IPv6 literal, handled below by URL parser
];

export function guardUrl(raw: unknown): UrlGuardResult {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'url must be a non-empty string' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'url is not a valid URL' };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, reason: `scheme ${parsed.protocol} is not allowed — use http(s)` };
  }
  if (process.env.MCP_VIDEO_ALLOW_INTERNAL === '1') {
    return { ok: true, url: parsed.toString() };
  }
  const host = parsed.hostname;
  for (const pat of BLOCKED_HOST_PATTERNS) {
    if (pat.test(host)) {
      return {
        ok: false,
        reason: `host ${host} is private or loopback — set MCP_VIDEO_ALLOW_INTERNAL=1 to override`,
      };
    }
  }
  return { ok: true, url: parsed.toString() };
}
