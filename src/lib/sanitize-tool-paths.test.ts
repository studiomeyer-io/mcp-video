import { describe, it, expect } from 'vitest';
import { sanitizeToolPaths } from './sanitize-tool-paths.js';

/**
 * Each block pairs an "attack blocked" case with a "benign allowed" case, per
 * the field shape the tool uses. `sanitizeToolPaths` throws on the first
 * offending path and is a silent no-op otherwise.
 */
describe('sanitize-tool-paths — scalar path fields', () => {
  it('blocks a leading-dash outputPath (flag injection)', () => {
    expect(() =>
      sanitizeToolPaths('crop_video', { inputPath: 'in.mp4', outputPath: '-y' }),
    ).toThrow(/outputPath.*flag/);
  });

  it('blocks a leading-dash inputPath', () => {
    expect(() =>
      sanitizeToolPaths('adjust_video_speed', { inputPath: '-i', outputPath: 'out.mp4' }),
    ).toThrow(/inputPath.*flag/);
  });

  it('blocks a NUL byte in a path', () => {
    expect(() =>
      sanitizeToolPaths('extract_audio', { inputPath: 'a.mp4\0-i', outputPath: 'b.mp3' }),
    ).toThrow(/null byte/);
  });

  it('allows ordinary input/output paths', () => {
    expect(() =>
      sanitizeToolPaths('apply_color_grade', {
        inputPath: '/home/user/clip.mp4',
        outputPath: 'relative/out.mp4',
      }),
    ).not.toThrow();
  });

  it('skips omitted optional paths (unchanged benign behaviour)', () => {
    // outputPath is optional for many tools — undefined must not throw.
    expect(() => sanitizeToolPaths('extract_audio', { inputPath: 'a.mp4' })).not.toThrow();
  });

  it('validates every scalar field declared for a tool', () => {
    expect(() =>
      sanitizeToolPaths('burn_subtitles', {
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        subtitlePath: '-attach',
      }),
    ).toThrow(/subtitlePath.*flag/);
  });
});

describe('sanitize-tool-paths — string-array path fields (sync_to_beat clips)', () => {
  it('blocks a malicious entry inside the clips array', () => {
    expect(() =>
      sanitizeToolPaths('sync_to_beat', {
        audioPath: 'beat.mp3',
        outputPath: 'out.mp4',
        clips: ['ok1.mp4', '-f', 'ok2.mp4'],
      }),
    ).toThrow(/clips\[1\].*flag/);
  });

  it('allows a clean clips array', () => {
    expect(() =>
      sanitizeToolPaths('sync_to_beat', {
        audioPath: 'beat.mp3',
        outputPath: 'out.mp4',
        clips: ['a.mp4', 'b.mp4'],
      }),
    ).not.toThrow();
  });
});

describe('sanitize-tool-paths — object-array path fields (concat clips / mixer tracks)', () => {
  it('blocks a malicious clip path in concatenate_videos', () => {
    expect(() =>
      sanitizeToolPaths('concatenate_videos', {
        outputPath: 'out.mp4',
        clips: [{ path: 'good.mp4' }, { path: '-i' }],
      }),
    ).toThrow(/clips\[1\]\.path.*flag/);
  });

  it('blocks a malicious track path in mix_audio_tracks', () => {
    expect(() =>
      sanitizeToolPaths('mix_audio_tracks', {
        outputPath: 'out.aac',
        tracks: [{ path: 'voice.mp3' }, { path: '-protocol_whitelist' }],
      }),
    ).toThrow(/tracks\[1\]\.path.*flag/);
  });

  it('allows clean object-array paths', () => {
    expect(() =>
      sanitizeToolPaths('concatenate_videos', {
        outputPath: 'out.mp4',
        clips: [{ path: 'a.mp4', trimStart: 1 }, { path: 'b.mp4' }],
      }),
    ).not.toThrow();
  });
});

describe('sanitize-tool-paths — record path fields (render_template clips)', () => {
  it('blocks a malicious value in the clips record', () => {
    expect(() =>
      sanitizeToolPaths('render_template', {
        templateId: 'social-reel',
        outputPath: 'out.mp4',
        clips: { intro: 'good.mp4', main: '-y' },
      }),
    ).toThrow(/clips\.main.*flag/);
  });

  it('allows a clean clips record', () => {
    expect(() =>
      sanitizeToolPaths('render_template', {
        templateId: 'social-reel',
        outputPath: 'out.mp4',
        clips: { intro: 'a.mp4', main: 'b.mp4' },
      }),
    ).not.toThrow();
  });
});

describe('sanitize-tool-paths — chroma-key background (path OR hex colour)', () => {
  it('blocks a leading-dash background path', () => {
    expect(() =>
      sanitizeToolPaths('apply_chroma_key', {
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        background: '-f',
      }),
    ).toThrow(/background.*flag/);
  });

  it('allows a bare 6-digit hex colour as background', () => {
    for (const hex of ['00FF00', '#0000FF', '0x000000']) {
      expect(() =>
        sanitizeToolPaths('apply_chroma_key', {
          inputPath: 'in.mp4',
          outputPath: 'out.mp4',
          background: hex,
        }),
      ).not.toThrow();
    }
  });

  it('allows a real background file path', () => {
    expect(() =>
      sanitizeToolPaths('apply_chroma_key', {
        inputPath: 'in.mp4',
        outputPath: 'out.mp4',
        background: 'backgrounds/beach.png',
      }),
    ).not.toThrow();
  });
});

describe('sanitize-tool-paths — registry boundaries', () => {
  it('is a no-op for tools without path fields', () => {
    expect(() => sanitizeToolPaths('list_voices', {})).not.toThrow();
    expect(() => sanitizeToolPaths('list_video_templates', { category: 'promo' })).not.toThrow();
  });

  it('is a no-op for unknown tools', () => {
    expect(() => sanitizeToolPaths('nonexistent_tool', { outputPath: '-y' })).not.toThrow();
  });

  it('tolerates non-object args', () => {
    expect(() => sanitizeToolPaths('crop_video', null)).not.toThrow();
    expect(() => sanitizeToolPaths('crop_video', undefined)).not.toThrow();
    expect(() => sanitizeToolPaths('crop_video', 'not-an-object')).not.toThrow();
  });

  it('ignores malformed array entries instead of crashing', () => {
    // objectArray entries that are not objects-with-path are skipped.
    expect(() =>
      sanitizeToolPaths('concatenate_videos', {
        outputPath: 'out.mp4',
        clips: [null, 'string-entry', { noPath: true }],
      }),
    ).not.toThrow();
  });
});
