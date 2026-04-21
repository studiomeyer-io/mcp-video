import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock so vi.mock resolves before imports.
const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

// IMPORTANT: import AFTER vi.mock so the mock is bound.
import { runFfmpeg } from './ffmpeg-run.js';

describe('ffmpeg-run — runFfmpeg', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('prepends -protocol_whitelist on every call (local-only default)', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(null, 'ok', '');
    });
    await runFfmpeg(['-i', 'in.mp4', 'out.mp4']);
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args[0]).toBe('-protocol_whitelist');
    expect(args[1]).toBe('file,pipe,crypto,cache,fd');
    expect(args.slice(2)).toEqual(['-i', 'in.mp4', 'out.mp4']);
  });

  it('honours https-input protocol set', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(null, '', '');
    });
    await runFfmpeg(['-i', 'https://a.example/s.m3u8'], { protocols: 'https-input' });
    const args = execFileMock.mock.calls[0][1] as string[];
    expect(args[1]).toContain('https');
    expect(args[1]).not.toContain('http,');
  });

  it('resolves with stdout by default', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(null, 'stdout-data', 'stderr-data');
    });
    const out = await runFfmpeg(['in']);
    expect(out).toBe('stdout-data');
  });

  it('resolves with stderr when resolver="stderr" (beat-sync use-case)', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(null, 'stdout-data', 'filter-info-on-stderr');
    });
    const out = await runFfmpeg(['in'], {}, 'stderr');
    expect(out).toBe('filter-info-on-stderr');
  });

  it('rejects with a sanitized message when ffmpeg fails', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      const err = new Error('exit 1');
      cb(err, '', 'Authorization: Bearer sk-super-secret-1234567890');
    });
    await expect(runFfmpeg(['in'])).rejects.toThrow(/\[REDACTED\]/);
  });

  it('honours custom maxBuffer and timeoutMs', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, opts, cb) => {
      expect((opts as { maxBuffer: number; timeout?: number }).maxBuffer).toBe(123);
      expect((opts as { maxBuffer: number; timeout?: number }).timeout).toBe(456);
      cb(null, '', '');
    });
    await runFfmpeg([], { maxBuffer: 123, timeoutMs: 456 });
  });

  it('includes the label in the rejection message', async () => {
    execFileMock.mockImplementationOnce((_bin, _args, _opts, cb) => {
      cb(new Error('x'), '', 'boom');
    });
    await expect(runFfmpeg([], { label: 'lut-preset' })).rejects.toThrow(/lut-preset/);
  });
});
