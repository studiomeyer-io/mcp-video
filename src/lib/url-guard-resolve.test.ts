/**
 * Tests for the async, DNS-resolving URL guard `resolveAndGuardUrl`.
 *
 * This is the strong SSRF check now used by every URL-taking handler
 * (record_website_*, create_narrated_video, screenshot_element,
 * detect_page_features). Where the sync `guardUrl` only inspects the literal
 * host, this one resolves the hostname and rejects when it points at a
 * loopback / RFC1918 / cloud-metadata address — the classic DNS-rebinding
 * bypass. `node:dns/promises.lookup` is mocked so the suite is hermetic and
 * never hits the network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

// Import AFTER the mock so the binding is the mock.
import { resolveAndGuardUrl } from './url-guard.js';

const ORIGINAL_ALLOW_INTERNAL = process.env.MCP_VIDEO_ALLOW_INTERNAL;

beforeEach(() => {
  lookupMock.mockReset();
  delete process.env.MCP_VIDEO_ALLOW_INTERNAL;
});
afterEach(() => {
  if (ORIGINAL_ALLOW_INTERNAL === undefined) delete process.env.MCP_VIDEO_ALLOW_INTERNAL;
  else process.env.MCP_VIDEO_ALLOW_INTERNAL = ORIGINAL_ALLOW_INTERNAL;
});

describe('resolveAndGuardUrl — DNS-rebinding defense', () => {
  it('blocks a public hostname that resolves to a loopback address', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const res = await resolveAndGuardUrl('https://rebind.evil.example/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/resolves to private address 127\.0\.0\.1/);
  });

  it('blocks a hostname resolving to the cloud-metadata IP (169.254.169.254)', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    const res = await resolveAndGuardUrl('https://metadata.evil.example/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/169\.254\.169\.254/);
  });

  it('blocks when ANY resolved address is internal (multi-A record)', async () => {
    lookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 }, // public
      { address: '10.0.0.5', family: 4 }, // private — must trip the guard
    ]);
    const res = await resolveAndGuardUrl('https://mixed.evil.example/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/10\.0\.0\.5/);
  });

  it('blocks an internal IPv6 resolution (unique-local fc00::/7)', async () => {
    lookupMock.mockResolvedValueOnce([{ address: 'fc00::1', family: 6 }]);
    const res = await resolveAndGuardUrl('https://v6.evil.example/');
    expect(res.ok).toBe(false);
  });

  it('allows a hostname that resolves to a public address', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const res = await resolveAndGuardUrl('https://example.com/page');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.url).toContain('example.com');
  });

  it('returns a clean failure when DNS resolution itself fails', async () => {
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const res = await resolveAndGuardUrl('https://nxdomain.invalid/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/DNS lookup failed/);
  });
});

describe('resolveAndGuardUrl — short-circuits (no DNS call)', () => {
  it('rejects a non-http scheme before any lookup', async () => {
    const res = await resolveAndGuardUrl('file:///etc/passwd');
    expect(res.ok).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a literal internal IP via the sync layer (no lookup needed)', async () => {
    const res = await resolveAndGuardUrl('http://127.0.0.1/');
    expect(res.ok).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('does not resolve a literal public IPv4 (already host-checked)', async () => {
    const res = await resolveAndGuardUrl('https://93.184.216.34/');
    expect(res.ok).toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('does not resolve a literal IPv6 host', async () => {
    const res = await resolveAndGuardUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/');
    expect(res.ok).toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('skips DNS entirely when MCP_VIDEO_ALLOW_INTERNAL=1', async () => {
    process.env.MCP_VIDEO_ALLOW_INTERNAL = '1';
    const res = await resolveAndGuardUrl('https://internal.dev.example/');
    expect(res.ok).toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string input without resolving', async () => {
    const res = await resolveAndGuardUrl(undefined);
    expect(res.ok).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
