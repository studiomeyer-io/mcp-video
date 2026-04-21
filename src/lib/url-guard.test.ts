/**
 * Tests for the URL safety guard.
 *
 * The guard is the single chokepoint for any tool that navigates a
 * user-supplied URL (Playwright page.goto, ffmpeg -i http://…). A bug here
 * lets an AI assistant coerce the server to probe localhost, cloud metadata
 * endpoints, or internal RFC1918 addresses, so this file exercises every
 * branch of the reject rules and the MCP_VIDEO_ALLOW_INTERNAL escape hatch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { guardUrl } from './url-guard.js';

const ORIGINAL_ALLOW_INTERNAL = process.env.MCP_VIDEO_ALLOW_INTERNAL;

beforeEach(() => {
  delete process.env.MCP_VIDEO_ALLOW_INTERNAL;
});
afterEach(() => {
  if (ORIGINAL_ALLOW_INTERNAL === undefined) {
    delete process.env.MCP_VIDEO_ALLOW_INTERNAL;
  } else {
    process.env.MCP_VIDEO_ALLOW_INTERNAL = ORIGINAL_ALLOW_INTERNAL;
  }
});

describe('guardUrl — input validation', () => {
  it('rejects a non-string input (number)', () => {
    const result = guardUrl(42 as unknown);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/non-empty string/);
  });

  it('rejects null and undefined', () => {
    expect(guardUrl(null).ok).toBe(false);
    expect(guardUrl(undefined).ok).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = guardUrl('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/non-empty string/);
  });

  it('rejects a malformed URL', () => {
    const result = guardUrl('not a url at all');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not a valid URL/);
  });
});

describe('guardUrl — scheme rules', () => {
  it('allows https:// to a public host', () => {
    const result = guardUrl('https://example.com/path');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe('https://example.com/path');
  });

  it('allows http:// to a public host', () => {
    const result = guardUrl('http://example.com');
    expect(result.ok).toBe(true);
  });

  it('rejects file://', () => {
    const result = guardUrl('file:///etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scheme .* not allowed/);
  });

  it('rejects ftp://', () => {
    const result = guardUrl('ftp://example.com/file.txt');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scheme ftp/);
  });

  it('rejects gopher:// (Redis-SSRF vector)', () => {
    const result = guardUrl('gopher://evil.example/_redis');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/scheme gopher/);
  });

  it('rejects data: URLs', () => {
    const result = guardUrl('data:text/html,<script>alert(1)</script>');
    expect(result.ok).toBe(false);
  });

  it('rejects javascript: URLs', () => {
    const result = guardUrl('javascript:alert(1)');
    expect(result.ok).toBe(false);
  });
});

describe('guardUrl — private-network blocks', () => {
  it('blocks localhost by name', () => {
    const result = guardUrl('http://localhost:8080/admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/private or loopback/);
  });

  it('blocks 127.0.0.1 (IPv4 loopback)', () => {
    expect(guardUrl('http://127.0.0.1/').ok).toBe(false);
    expect(guardUrl('http://127.5.6.7/').ok).toBe(false);
  });

  it('blocks IPv6 loopback ::1', () => {
    // URL spec writes [::1] for IPv6 literals; parser normalises to [::1].
    const result = guardUrl('http://[::1]/');
    expect(result.ok).toBe(false);
  });

  it('blocks the 10/8 private range', () => {
    expect(guardUrl('http://10.0.0.1/').ok).toBe(false);
    expect(guardUrl('http://10.255.255.255/').ok).toBe(false);
  });

  it('blocks the 192.168/16 private range', () => {
    expect(guardUrl('http://192.168.1.1/').ok).toBe(false);
    expect(guardUrl('http://192.168.255.255/').ok).toBe(false);
  });

  it('blocks the 172.16/12 private range (CIDR edge cases)', () => {
    expect(guardUrl('http://172.16.0.1/').ok).toBe(false);
    expect(guardUrl('http://172.20.1.1/').ok).toBe(false);
    expect(guardUrl('http://172.31.255.255/').ok).toBe(false);
  });

  it('does NOT block addresses just outside 172.16/12', () => {
    // 172.15.x.x and 172.32.x.x are public.
    expect(guardUrl('http://172.15.0.1/').ok).toBe(true);
    expect(guardUrl('http://172.32.0.1/').ok).toBe(true);
  });

  it('blocks 169.254/16 link-local (covers AWS/GCP/Azure metadata at 169.254.169.254)', () => {
    const aws = guardUrl('http://169.254.169.254/latest/meta-data/');
    expect(aws.ok).toBe(false);
    if (!aws.ok) expect(aws.reason).toMatch(/private or loopback/);
    expect(guardUrl('http://169.254.0.1/').ok).toBe(false);
  });

  it('blocks 0.0.0.0 / 0.x.x.x', () => {
    expect(guardUrl('http://0.0.0.0/').ok).toBe(false);
    expect(guardUrl('http://0.1.2.3/').ok).toBe(false);
  });

  it('blocks IPv6 unique-local (fcXX::)', () => {
    expect(guardUrl('http://[fc00::1]/').ok).toBe(false);
    expect(guardUrl('http://[fd12::1]/').ok).toBe(false);
  });

  it('blocks IPv6 link-local (fe80::)', () => {
    expect(guardUrl('http://[fe80::1]/').ok).toBe(false);
  });

  // ── Bypass-vector coverage (Critic round 2, Session 839) ──
  // These encodings are classic SSRF-filter evasion. They work against
  // regex-only guards that look for the literal string "127.0.0.1".
  // Node's WHATWG URL parser normalises all of them, so our dotted-decimal
  // + bracketed-IPv6 patterns catch every form — we test here to lock it in.

  it('blocks IPv6-mapped-IPv4 literals ([::ffff:127.0.0.1])', () => {
    // URL parser normalises ::ffff:127.0.0.1 → ::ffff:7f00:1 (compact form).
    // Our /^\[/ generic-IPv6-literal pattern catches both, regardless of
    // whether anyone embedded a v4 address in it.
    expect(guardUrl('http://[::ffff:127.0.0.1]/').ok).toBe(false);
    expect(guardUrl('http://[::ffff:7f00:1]/').ok).toBe(false);
    expect(guardUrl('http://[0:0:0:0:0:ffff:7f00:1]/').ok).toBe(false);
  });

  it('blocks decimal-encoded IPv4 (URL parser normalises to dotted)', () => {
    // 2130706433 == 0x7F000001 == 127.0.0.1.
    expect(guardUrl('http://2130706433/').ok).toBe(false);
  });

  it('blocks hex-encoded IPv4 (URL parser normalises to dotted)', () => {
    expect(guardUrl('http://0x7f000001/').ok).toBe(false);
  });

  it('blocks octal-encoded IPv4 (URL parser normalises to dotted)', () => {
    // 0177.0.0.1 (octal for 127) → 127.0.0.1 after parsing.
    expect(guardUrl('http://0177.0.0.1/').ok).toBe(false);
  });

  it('blocks short-form IPv4 (http://127.1/ → 127.0.0.1)', () => {
    expect(guardUrl('http://127.1/').ok).toBe(false);
  });

  it('blocks bare "http://0/" (URL parser expands to 0.0.0.0)', () => {
    expect(guardUrl('http://0/').ok).toBe(false);
  });
});

describe('guardUrl — public hosts pass through', () => {
  it('allows a typical public domain', () => {
    expect(guardUrl('https://www.example.com/').ok).toBe(true);
  });

  it('allows a public IPv4 (8.8.8.8)', () => {
    expect(guardUrl('http://8.8.8.8/').ok).toBe(true);
  });

  it('allows URLs with query strings and ports', () => {
    const result = guardUrl('https://api.example.com:8443/v1/data?x=1&y=2');
    expect(result.ok).toBe(true);
  });

  it('normalises URL formatting via WHATWG URL', () => {
    // URL parser lowercases the scheme + host, appends default path.
    const result = guardUrl('HTTPS://Example.COM');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe('https://example.com/');
  });
});

describe('guardUrl — MCP_VIDEO_ALLOW_INTERNAL escape hatch', () => {
  it('allows localhost when MCP_VIDEO_ALLOW_INTERNAL=1', () => {
    process.env.MCP_VIDEO_ALLOW_INTERNAL = '1';
    expect(guardUrl('http://localhost:3000/').ok).toBe(true);
  });

  it('allows RFC1918 addresses when the flag is on', () => {
    process.env.MCP_VIDEO_ALLOW_INTERNAL = '1';
    expect(guardUrl('http://192.168.1.1/').ok).toBe(true);
    expect(guardUrl('http://10.0.0.1/').ok).toBe(true);
  });

  it('still rejects non-http(s) schemes even with the flag on', () => {
    // Flag opens the private-network door, NOT the scheme door.
    process.env.MCP_VIDEO_ALLOW_INTERNAL = '1';
    expect(guardUrl('file:///etc/passwd').ok).toBe(false);
  });

  it('does NOT treat arbitrary truthy values as "on" — only the string "1"', () => {
    process.env.MCP_VIDEO_ALLOW_INTERNAL = 'true';
    expect(guardUrl('http://localhost/').ok).toBe(false);
    process.env.MCP_VIDEO_ALLOW_INTERNAL = 'yes';
    expect(guardUrl('http://localhost/').ok).toBe(false);
    process.env.MCP_VIDEO_ALLOW_INTERNAL = '0';
    expect(guardUrl('http://localhost/').ok).toBe(false);
  });
});

describe('guardUrl — return-type narrowing', () => {
  it('on success, result.url is the normalised absolute URL', () => {
    const result = guardUrl('https://example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Type narrowing: result.url exists, result.reason does not.
      expect(typeof result.url).toBe('string');
      expect(result.url.startsWith('https://')).toBe(true);
    }
  });

  it('on failure, result.reason is a non-empty string', () => {
    const result = guardUrl('ftp://example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
