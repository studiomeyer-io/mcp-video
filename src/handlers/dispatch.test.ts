import { describe, it, expect, vi } from 'vitest';

// Logger writes to stderr; silence it so test output stays clean.
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), logError: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleToolCall } from './index.js';

function parse(res: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}

describe('handleToolCall — path-injection choke point', () => {
  it('blocks a flag-injection outputPath before reaching the engine', async () => {
    const res = await handleToolCall('crop_video', {
      inputPath: 'in.mp4',
      outputPath: '-y',
      width: 100,
      height: 100,
    });
    expect(res.isError).toBe(true);
    const body = parse(res);
    expect(String(body.error)).toMatch(/outputPath.*flag/);
  });

  it('blocks a flag-injection clip path in concatenate_videos', async () => {
    const res = await handleToolCall('concatenate_videos', {
      outputPath: 'out.mp4',
      clips: [{ path: 'a.mp4' }, { path: '-protocol_whitelist' }],
    });
    expect(res.isError).toBe(true);
    expect(String(parse(res).error)).toMatch(/clips\[1\]\.path.*flag/);
  });

  it('returns a structured error (never throws) for an unknown tool', async () => {
    const res = await handleToolCall('does_not_exist', { outputPath: '-y' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Unknown tool');
  });

  it('lets benign args pass the choke point (failure, if any, is not flag-injection)', async () => {
    // No ffmpeg binary in this environment, so the engine will fail at
    // assertExists/spawn — but crucially NOT with a flag-injection error,
    // which proves sanitizeToolPaths did not false-positive on a valid path.
    const res = await handleToolCall('crop_video', {
      inputPath: 'definitely-missing-input.mp4',
      outputPath: 'out.mp4',
      width: 100,
      height: 100,
    });
    expect(res.isError).toBe(true);
    expect(String(parse(res).error)).not.toMatch(/flag/);
  });
});
