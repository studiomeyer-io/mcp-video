# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added — url-guard test suite

- **`src/lib/url-guard.test.ts`** (38 tests) locks in every branch of
  `guardUrl()`, including the classic SSRF-filter evasion encodings. All
  pass because Node's WHATWG URL parser normalises them before the regex
  check sees the hostname; the tests exist so a future parser change,
  regex tweak, or refactor can't silently re-open the hole.

  Covered bypass vectors: decimal IPv4 (`http://2130706433/`), hex IPv4
  (`0x7f000001`), octal IPv4 (`0177.0.0.1`), short-form IPv4 (`127.1`),
  bare zero (`http://0/`), IPv6-mapped IPv4 (`[::ffff:127.0.0.1]` plus
  its compact `[::ffff:7f00:1]` and expanded forms).

  Plus full coverage of the scheme allow-list (rejects `file://`, `ftp://`,
  `gopher://`, `data:`, `javascript:`), private ranges, link-local
  (including the AWS/GCP/Azure metadata endpoint at `169.254.169.254`),
  IPv6 `::1` / fc00::/7 ULA / fe80::/10 link-local, and the
  `MCP_VIDEO_ALLOW_INTERNAL` escape hatch (strict equality on `"1"` —
  `"true"` / `"yes"` / `"0"` do not open the door).

## [1.0.0] - 2026-03-14

### Added

- **40+ video/image tools** — comprehensive MCP toolset for video production
- **Website recording** — full-page and element recording via Playwright
- **Video editing** — cut, concatenate, crop, speed adjust, reverse, PiP compose via FFmpeg
- **TTS narration** — text-to-speech with multiple voices and voice effects
- **Social format export** — one-click conversion to Instagram, TikTok, YouTube Shorts, LinkedIn formats
- **Dual transport** — stdio for CLI integration, HTTP for remote/agent access
- **Smart screenshots** — element-level and full-page capture with auto-scroll
- **Cinema-grade animations** — keyframe animations, text overlays, animated titles
- **Color grading** — LUT presets and custom color grade application
- **Audio tools** — background music, audio ducking, beat sync, multi-track mixing
- **Chroma key** — green screen removal
- **Auto captions** — automatic subtitle generation and burn-in
- **Carousel and intro generation** — templated content creation
