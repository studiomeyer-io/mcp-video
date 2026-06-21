/**
 * Central path-argument sanitizer for MCP tool handlers.
 *
 * The threat (already documented in ffmpeg-safety.ts) is real: every tool
 * that shells out to ffmpeg/ffprobe passes user-supplied path strings as
 * positional arguments. ffmpeg treats any argument that begins with `-` as
 * a *flag*, not a filename — so a caller (or a confused LLM following an
 * injected instruction) that sets `outputPath` to `-y`, `-f`, or
 * `-protocol_whitelist` can rewrite the command instead of naming a file.
 * Strings containing NUL bytes are equally dangerous (C-string truncation).
 *
 * `validateFfmpegPath` was written precisely to stop this, but until now it
 * was wired into a single engine (narrated-video). The engines validate
 * *input* existence (`assertExists`) which incidentally blocks some flag
 * inputs, but they never check *output* paths — and several inputs flow
 * through `fs.copyFileSync` / the concat demuxer without an existence check
 * at all. The defense therefore had a wide bypass.
 *
 * This module closes the gap at the handler boundary — the one place every
 * untrusted MCP argument enters — so no engine logic (filter graph building,
 * arg ordering) has to change. Each tool declares which argument keys are
 * path-like; nested arrays of paths (concat clips, audio-mixer tracks) are
 * walked too.
 */

import { validateFfmpegPath } from './ffmpeg-safety.js';

/** Describes where path-like values live in a tool's argument object. */
interface PathFieldSpec {
  /** Top-level keys whose value is a single path string. */
  readonly scalar?: readonly string[];
  /** Keys whose value is an array of path strings (e.g. beat-sync `clips`). */
  readonly stringArray?: readonly string[];
  /**
   * Keys whose value is an array of objects each carrying a `path` field
   * (e.g. concatenate_videos `clips`, mix_audio_tracks `tracks`).
   */
  readonly objectArrayPath?: readonly string[];
  /** Keys whose value is a record of name → path (template-renderer `clips`). */
  readonly recordValues?: readonly string[];
  /**
   * Keys that are a path OR a benign non-path token (chroma-key `background`
   * may be a 6-digit hex colour). Only validated when the value looks like a
   * filesystem path rather than the allowed alternative.
   */
  readonly pathOrHex?: readonly string[];
}

/**
 * Per-tool path-field registry. Only ffmpeg/ffprobe-shelling tools are listed
 * here — tools that merely write via fs/Playwright (generate_speech,
 * screenshot_element) are handled separately because a leading-`-` there is a
 * file-write, not flag injection. Keep this in sync with the handler args.
 */
const TOOL_PATH_FIELDS: Record<string, PathFieldSpec> = {
  // post-production
  add_background_music: { scalar: ['videoPath', 'musicPath', 'outputPath'] },
  concatenate_videos: { scalar: ['outputPath'], objectArrayPath: ['clips'] },
  generate_intro: { scalar: ['outputPath'] },
  convert_social_format: { scalar: ['inputPath', 'outputPath'] },
  convert_all_social_formats: { scalar: ['inputPath', 'outputDir'] },
  add_text_overlay: { scalar: ['inputPath', 'outputPath'] },

  // editing
  adjust_video_speed: { scalar: ['inputPath', 'outputPath'] },
  apply_color_grade: { scalar: ['inputPath', 'outputPath'] },
  apply_video_effect: { scalar: ['inputPath', 'outputPath'] },
  crop_video: { scalar: ['inputPath', 'outputPath'] },
  reverse_clip: { scalar: ['inputPath', 'outputPath'] },
  extract_audio: { scalar: ['inputPath', 'outputPath'] },
  burn_subtitles: { scalar: ['inputPath', 'outputPath', 'subtitlePath'] },
  auto_caption: { scalar: ['inputPath', 'outputPath'] },
  add_keyframe_animation: { scalar: ['inputPath', 'outputPath'] },
  compose_picture_in_pip: { scalar: ['mainVideo', 'overlayVideo', 'outputPath'] },
  add_audio_ducking: { scalar: ['inputPath', 'outputPath'] },

  // capcut-tier
  apply_lut_preset: { scalar: ['inputPath', 'outputPath'] },
  apply_voice_effect: { scalar: ['inputPath', 'outputPath'] },
  apply_chroma_key: { scalar: ['inputPath', 'outputPath'], pathOrHex: ['background'] },
  sync_to_beat: { scalar: ['audioPath', 'outputPath'], stringArray: ['clips'] },
  animate_text: { scalar: ['inputPath', 'outputPath'] },
  mix_audio_tracks: { scalar: ['outputPath'], objectArrayPath: ['tracks'] },
  render_template: { scalar: ['outputPath', 'musicPath'], recordValues: ['clips'] },

  // tts (narrated video also shells out via the recording + concat pipeline)
  create_narrated_video: { scalar: ['outputPath', 'backgroundMusicPath'] },
};

const HEX_COLOR = /^(?:#|0x)?[0-9a-fA-F]{6}$/;

/** A value is "present" for validation if it is a non-empty string. */
function isPresentString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Validate every path-like argument for the named tool. Throws the same
 * error class `validateFfmpegPath` throws (TypeError / Error) on the first
 * offending value, which the handler's try/catch turns into a structured
 * tool error. Tools not in the registry are left untouched.
 *
 * Only *present* values are checked — optional paths that the caller omitted
 * (and the handler will default) are skipped so behaviour is unchanged for
 * benign callers.
 */
export function sanitizeToolPaths(toolName: string, args: unknown): void {
  const spec = TOOL_PATH_FIELDS[toolName];
  if (!spec) return;
  if (typeof args !== 'object' || args === null) return;
  const record = args as Record<string, unknown>;

  for (const key of spec.scalar ?? []) {
    const value = record[key];
    if (isPresentString(value)) validateFfmpegPath(value, key);
  }

  for (const key of spec.stringArray ?? []) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    value.forEach((entry, i) => {
      if (isPresentString(entry)) validateFfmpegPath(entry, `${key}[${i}]`);
    });
  }

  for (const key of spec.objectArrayPath ?? []) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    value.forEach((entry, i) => {
      if (entry && typeof entry === 'object' && 'path' in entry) {
        const p = (entry as { path: unknown }).path;
        if (isPresentString(p)) validateFfmpegPath(p, `${key}[${i}].path`);
      }
    });
  }

  for (const key of spec.recordValues ?? []) {
    const value = record[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [slot, p] of Object.entries(value as Record<string, unknown>)) {
      if (isPresentString(p)) validateFfmpegPath(p, `${key}.${slot}`);
    }
  }

  for (const key of spec.pathOrHex ?? []) {
    const value = record[key];
    // A bare 6-digit hex colour (e.g. "00FF00") is a legitimate non-path
    // value for chroma-key backgrounds — skip those. Anything else is treated
    // as a path and must pass the flag-injection / NUL-byte check.
    if (isPresentString(value) && !HEX_COLOR.test(value)) {
      validateFfmpegPath(value, key);
    }
  }
}
