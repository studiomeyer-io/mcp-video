/**
 * URL safety guard for any tool that fetches/navigates user-supplied URLs.
 *
 * Blocks four classes of SSRF abuse that an AI assistant can stumble into
 * when the server is asked to open arbitrary URLs:
 *   1. Non-http(s) schemes (file://, ftp://, gopher://, data: etc.)
 *   2. Loopback + link-local + RFC1918 + cloud metadata endpoints
 *   3. IPv6-mapped IPv4 (::ffff:127.0.0.1) that slips past IPv4 regex
 *   4. DNS-rebinding — hostnames that resolve to internal IPs
 *
 * Three entry points:
 *   • guardUrl(raw)            sync — scheme + literal-host check
 *   • resolveAndGuardUrl(raw)  async — adds DNS.lookup(family:0) on the host
 *   • guardFinalUrl(raw)       sync — post-redirect check, reuses guardUrl
 *
 * Opt-in escape hatch for local dev: set MCP_VIDEO_ALLOW_INTERNAL=1.
 */

import { lookup } from 'node:dns/promises';

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
  // IPv6 unique-local is fc00::/7 — that covers fc00..fdff.
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i, // IPv6 link-local
];

// IPv4 dotted-quad literal (captures the form the OS + URL parser canonicalize to).
const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// IPv6-mapped IPv4 in dotted form: ::ffff:127.0.0.1
const IPV6_MAPPED_IPV4_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
// IPv6-mapped IPv4 in compact hex form: ::ffff:7f00:1
const IPV6_MAPPED_IPV4_HEX = /^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i;
// IPv6-mapped IPv4 in fully uncompressed form: 0:0:0:0:0:ffff:7f00:1
const IPV6_MAPPED_IPV4_FULL = /^0:0:0:0:0:ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i;

function normalizeHost(hostname: string): string {
  // URL parser strips brackets from IPv6 hostnames already; be defensive
  // in case a caller passes the raw host string.
  const unbracketed = hostname.replace(/^\[/, '').replace(/\]$/, '');
  const mapped = unbracketed.match(IPV6_MAPPED_IPV4_DOTTED);
  if (mapped) return mapped[1]; // re-check dotted form against IPv4 patterns
  return unbracketed;
}

function isMappedIpv4(host: string): boolean {
  return (
    IPV6_MAPPED_IPV4_DOTTED.test(host) ||
    IPV6_MAPPED_IPV4_HEX.test(host) ||
    IPV6_MAPPED_IPV4_FULL.test(host)
  );
}

function isBlockedHost(hostname: string): string | null {
  const normalized = normalizeHost(hostname);
  if (isMappedIpv4(normalized)) {
    return `host ${hostname} is IPv6-mapped IPv4 — blocked`;
  }
  for (const pat of BLOCKED_HOST_PATTERNS) {
    if (pat.test(normalized)) {
      return `host ${hostname} is private or loopback — set MCP_VIDEO_ALLOW_INTERNAL=1 to override`;
    }
  }
  return null;
}

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
  const blocked = isBlockedHost(parsed.hostname);
  if (blocked) return { ok: false, reason: blocked };
  return { ok: true, url: parsed.toString() };
}

/**
 * Async variant that also resolves the hostname via DNS and checks every
 * returned IP against the block list. Catches the simple rebind case where
 * a public hostname resolves to a loopback or RFC1918 address.
 *
 * NOTE: This does not eliminate TOCTOU windows — the browser/ffmpeg will
 * resolve again at request time. But it blocks the trivial path and forces
 * an attacker to rely on narrow TTL-based flipping.
 */
export async function resolveAndGuardUrl(raw: unknown): Promise<UrlGuardResult> {
  const first = guardUrl(raw);
  if (!first.ok) return first;
  if (process.env.MCP_VIDEO_ALLOW_INTERNAL === '1') return first;
  const parsed = new URL(first.url);
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');

  // Literal IPv4/IPv6 — guardUrl already checked, nothing to resolve.
  if (IPV4_LITERAL.test(host) || host.includes(':')) return first;

  try {
    const addresses = await lookup(host, { all: true, family: 0 });
    for (const addr of addresses) {
      const blocked = isBlockedHost(addr.address);
      if (blocked) {
        return {
          ok: false,
          reason: `host ${host} resolves to private address ${addr.address} — blocked`,
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `DNS lookup failed for ${host}: ${msg}` };
  }
  return first;
}

/**
 * Post-navigation check: after `page.goto()` the browser may have followed
 * redirects to an internal host. Pass `page.url()` through this to confirm
 * the final URL is still guard-clean.
 */
export function guardFinalUrl(raw: unknown): UrlGuardResult {
  return guardUrl(raw);
}
