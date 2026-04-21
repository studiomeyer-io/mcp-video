import { describe, it, expect } from 'vitest';
import {
  buildFfmpegArgs,
  validateFfmpegPath,
  validateFfmpegPaths,
} from './ffmpeg-safety.js';

describe('ffmpeg-safety — buildFfmpegArgs', () => {
  it('prepends -protocol_whitelist local-only by default', () => {
    const out = buildFfmpegArgs(['-i', 'a.mp4', 'b.mp4']);
    expect(out[0]).toBe('-protocol_whitelist');
    expect(out[1]).toBe('file,pipe,crypto,cache,fd');
    expect(out.slice(2)).toEqual(['-i', 'a.mp4', 'b.mp4']);
  });

  it('supports https-input protocol set', () => {
    const out = buildFfmpegArgs(['-i', 'https://example.com/s.m3u8'], 'https-input');
    expect(out[1]).toBe('file,pipe,crypto,cache,fd,https,tls,tcp');
  });

  it('supports https-and-hls protocol set', () => {
    const out = buildFfmpegArgs(['-i', 'a.m3u8'], 'https-and-hls');
    expect(out[1]).toContain('hls');
    expect(out[1]).toContain('applehttp');
  });

  it('never includes http:// (plain-text) in any protocol set', () => {
    // Explicit check: mixing http would re-open SSRF to 169.254.x.x
    for (const set of ['local-only', 'https-input', 'https-and-hls'] as const) {
      const out = buildFfmpegArgs([], set);
      const protocols = out[1].split(',');
      expect(protocols).not.toContain('http');
      expect(protocols).not.toContain('rtmp');
      expect(protocols).not.toContain('rtsp');
      expect(protocols).not.toContain('ftp');
      expect(protocols).not.toContain('sftp');
    }
  });

  it('throws if args is not an array', () => {
    // @ts-expect-error intentional
    expect(() => buildFfmpegArgs('not-an-array')).toThrow(/array/);
  });
});

describe('ffmpeg-safety — validateFfmpegPath', () => {
  it('accepts normal file paths', () => {
    expect(validateFfmpegPath('/home/user/x.mp4')).toBe('/home/user/x.mp4');
    expect(validateFfmpegPath('relative/file.mov')).toBe('relative/file.mov');
  });

  it('rejects empty strings', () => {
    expect(() => validateFfmpegPath('')).toThrow(/non-empty/);
  });

  it('rejects non-string values', () => {
    expect(() => validateFfmpegPath(null)).toThrow();
    expect(() => validateFfmpegPath(undefined)).toThrow();
    expect(() => validateFfmpegPath(42)).toThrow();
  });

  it('rejects paths starting with "-" (flag injection)', () => {
    expect(() => validateFfmpegPath('-i')).toThrow(/flag/);
    expect(() => validateFfmpegPath('-protocol_whitelist')).toThrow(/flag/);
    expect(() => validateFfmpegPath('-help')).toThrow(/flag/);
  });

  it('rejects paths containing NUL bytes', () => {
    expect(() => validateFfmpegPath('safe\0-i /etc/passwd')).toThrow(/null byte/);
  });

  it('includes the label in error messages', () => {
    expect(() => validateFfmpegPath('-bad', 'input')).toThrow(/input/);
  });
});

describe('ffmpeg-safety — validateFfmpegPaths', () => {
  it('validates only the indices passed', () => {
    const args = ['-y', '-i', 'valid.mp4', '-c:v', 'libx264', '-foo'];
    // Only index 2 is a user-controlled path; -foo at index 5 is a built-in flag
    validateFfmpegPaths(args, [2]);
    expect(() => validateFfmpegPaths(args, [5])).toThrow(/flag/);
  });

  it('throws when any validated arg is empty', () => {
    expect(() => validateFfmpegPaths(['', 'x'], [0])).toThrow(/non-empty/);
  });
});
