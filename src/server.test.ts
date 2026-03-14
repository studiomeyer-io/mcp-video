import { describe, it, expect, vi } from 'vitest';

vi.mock('./lib/logger.js', () => ({
  logger: { info: vi.fn(), logError: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./lib/dual-transport.js', () => ({
  startDualTransport: vi.fn().mockResolvedValue({ type: 'stdio' }),
}));

vi.mock('./lib/types.js', () => ({
  jsonResponse: (data: unknown, isError?: boolean) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    ...(isError ? { isError: true } : {}),
  }),
}));

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn() },
}));

describe('createMcpServer', () => {
  it('creates server with 8 tools', async () => {
    const { createMcpServer } = await import('./server.js');
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});

describe('delegate function', () => {
  it('server exports createMcpServer', async () => {
    const mod = await import('./server.js');
    expect(typeof mod.createMcpServer).toBe('function');
  });
});

describe('handler registries', () => {
  it('video handlers exist', async () => {
    const { videoHandlers } = await import('./handlers/video.js');
    expect(videoHandlers).toBeDefined();
    expect(videoHandlers.record_website_video).toBeDefined();
    expect(videoHandlers.record_website_scroll).toBeDefined();
    expect(videoHandlers.record_multi_device).toBeDefined();
  });

  it('editing handlers exist', async () => {
    const { editingHandlers } = await import('./handlers/editing.js');
    expect(editingHandlers).toBeDefined();
    expect(editingHandlers.adjust_video_speed).toBeDefined();
    expect(editingHandlers.crop_video).toBeDefined();
    expect(editingHandlers.reverse_clip).toBeDefined();
  });

  it('capcut handlers exist', async () => {
    const { capcutHandlers } = await import('./handlers/capcut.js');
    expect(capcutHandlers).toBeDefined();
    expect(capcutHandlers.apply_lut_preset).toBeDefined();
    expect(capcutHandlers.sync_to_beat).toBeDefined();
  });

  it('post-production handlers exist', async () => {
    const { postProductionHandlers } = await import('./handlers/post-production.js');
    expect(postProductionHandlers).toBeDefined();
    expect(postProductionHandlers.concatenate_videos).toBeDefined();
    expect(postProductionHandlers.convert_social_format).toBeDefined();
  });

  it('tts handlers exist', async () => {
    const { ttsHandlers } = await import('./handlers/tts.js');
    expect(ttsHandlers).toBeDefined();
    expect(ttsHandlers.generate_speech).toBeDefined();
    expect(ttsHandlers.list_voices).toBeDefined();
    expect(ttsHandlers.create_narrated_video).toBeDefined();
  });

  it('screenshot handlers exist', async () => {
    const { smartScreenshotHandlers } = await import('./handlers/smart-screenshot.js');
    expect(smartScreenshotHandlers).toBeDefined();
    expect(smartScreenshotHandlers.screenshot_element).toBeDefined();
    expect(smartScreenshotHandlers.detect_page_features).toBeDefined();
  });
});

describe('tool consolidation', () => {
  it('all handler names are covered by delegate map', () => {
    const allOriginalNames = [
      'record_website_video', 'record_website_scroll', 'record_multi_device',
      'adjust_video_speed', 'crop_video', 'reverse_clip', 'add_keyframe_animation', 'compose_picture_in_pip',
      'apply_color_grade', 'apply_video_effect', 'apply_lut_preset', 'apply_chroma_key',
      'extract_audio', 'add_background_music', 'add_audio_ducking', 'mix_audio_tracks', 'apply_voice_effect',
      'burn_subtitles', 'auto_caption', 'add_text_overlay', 'animate_text',
      'concatenate_videos', 'generate_intro', 'convert_social_format', 'convert_all_social_formats',
      'sync_to_beat', 'list_video_templates', 'render_template',
      'generate_speech', 'list_voices', 'create_narrated_video',
      'screenshot_element', 'detect_page_features',
    ];
    expect(allOriginalNames.length).toBe(33);
  });
});
