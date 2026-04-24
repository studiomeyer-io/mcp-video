# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Security — Round-4 OSS-Sweep (2026-04-24)

- **`server.ts` dependency check**: replaced `execSync(\`which ${bin}\`)`
  shell-interpolation with `execFileSync('which', [bin], ...)`. The input
  was already a hardcoded literal array, so no real exposure today — this
  is defense-in-depth so a future refactor that makes the list
  config-driven can't turn into a command-injection sink. 89/89 tests
  still green, tsc clean.

### Security — hardening sweep (Session 840, 2026-04-21)

Four of the five Session 837 Must-Fix items plus the three Session 839
follow-up findings (DNS-rebinding, ffmpeg hop-2 SSRF, redirect following)
are now addressed in one coherent patch. 42 new tests; 89/89 green.

**Post-review follow-through (Session 840 Agent Critic):**

A full triple-agent review (Analyst + Critic + Research) caught one
remaining bypass: every engine still had a LOCAL `runFfmpeg` function that
delegated to the safe runner, but five engines (`audio.ts`,
`audio-mixer.ts`, `beat-sync.ts`, `editing.ts`, `voice-effects.ts`) ALSO
called `ffprobe` directly via `execFile('ffprobe', ...)` — and `ffprobe`
follows HLS/DASH playlists just like `ffmpeg` does. The "just probe it
first" path was a complete SSRF bypass.

- `src/lib/ffmpeg-run.ts` gains `runFfprobe(args, opts, resolver)` —
  same discipline as `runFfmpeg`: prepend `-protocol_whitelist`, sanitize
  stderr, label for rejection messages. Every `ffprobe` call across the
  five engines now routes through it.
- `narrated-video.ts` internal `runFfmpeg` helper now delegates to the
  central safe runner (was still using its own `execFile` wrapper from
  the first pass of the sweep).
- All thirteen engines drop their `import { execFile } from 'child_process'`
  now that the last consumer is gone.

**`src/lib/url-guard.ts` — DNS resolution + IPv6-mapped IPv4 + final URL check**

- New async `resolveAndGuardUrl(raw)` uses `dns.lookup(family:0)` and
  rejects any hostname that resolves to a loopback / RFC1918 / link-local
  IP. Catches the naive DNS-rebinding case where a public hostname
  resolves to `127.0.0.1` at lookup time.
- New `guardFinalUrl(raw)` is called AFTER `page.goto()` on the URL the
  browser actually landed on — 302 redirects to internal metadata
  endpoints are now blocked at the post-navigation checkpoint.
- `BLOCKED_HOST_PATTERNS` now matches the full `fc00::/7` ULA range
  (previously only `fc00:`, missing `fd00:`-`fdff:`).
- IPv6-mapped IPv4 (`::ffff:127.0.0.1`, `::ffff:7f00:1`, and
  `0:0:0:0:0:ffff:7f00:1` — all three forms the WHATWG URL parser
  can produce) are now explicitly blocked.

**`src/lib/ffmpeg-safety.ts` — protocol whitelist + flag-injection guard (NEW)**

- `buildFfmpegArgs(args, set)` prepends `-protocol_whitelist` to every
  ffmpeg invocation. Three protocol sets cover all internal use:
  `local-only` (file+pipe+crypto+cache+fd), `https-input` (adds
  https+tls+tcp for one-top-level-URL), `https-and-hls` (adds hls for
  master+segment playback). `http://` is in none of them — forces TLS
  for any network-bound ffmpeg read.
- `validateFfmpegPath(p, label)` rejects values starting with `-`
  (turns `-i /etc/passwd ...` smuggled as "filename" into an error) and
  null-byte injections. `validateFfmpegPaths(args, indices)` applies
  the check to specific user-controlled positions in an args array.

**`src/lib/ffmpeg-run.ts` — central ffmpeg runner (NEW)**

- Every engine (audio, audio-mixer, beat-sync, chroma-key, concat,
  editing, encoder, lut-presets, narrated-video, social-format,
  template-renderer, text-animations, text-overlay, voice-effects —
  14 call sites across 13 files) now routes through `runFfmpeg()`,
  which injects `-protocol_whitelist` + sanitizes stderr before it
  reaches logs or thrown errors. `resolver: 'stderr'` lets beat-sync
  still pick up its filter-info output.

**`src/lib/temp-dir.ts` — safe mkdtemp helper (NEW)**

- `withTempDir(prefix, fn)` wraps `fs.mkdtemp` + try/finally cleanup so
  a crash or throw inside `fn` still removes the directory. Replaces
  the predictable `/tmp/narrated-video-${Date.now()}` pattern in
  `tools/engine/narrated-video.ts` that raced when two invocations
  hit the same millisecond and leaked on SIGTERM.

**`src/lib/error-sanitizer.ts` — upstream-API secret scrub (NEW)**

- `sanitizeErrorMessage(raw, opts)` strips seven secret shapes before
  ffmpeg stderr or TTS-provider error bodies land in logs or thrown
  errors: Bearer tokens, `xi-api-key` / `x-api-key` header values,
  OpenAI `sk-` keys, AWS `AKIA...`, generic `"api_key"` JSON fields,
  Authorization headers (with a negative lookahead so already-redacted
  Bearer markers survive), and signed-URL `X-Amz-Signature` params.
  Length-capped at 300 chars by default.

**`src/handlers/tts.ts` — missing SSRF guard on `create_narrated_video`**

- Session 837 wrapped three video handlers in `guardUrl` but skipped
  `create_narrated_video`. That handler now guards `args.url` the same
  way as the other three — Playwright + ffmpeg no longer see
  unvalidated URLs.

**`src/tools/engine/capture.ts` + `smart-screenshot.ts` — post-redirect guard**

- Each `page.goto()` is now followed by `guardFinalUrl(page.url())`.
  If the browser followed a 302 to an internal host (classic SSRF
  escalation path via open redirect on a public domain), the engine
  throws before rendering frames or saving screenshots.

**`src/tools/engine/narrated-video.ts` — withTempDir + safe ffmpeg**

- `createNarratedVideo` now uses `withTempDir` instead of the
  predictable timestamp-based path. Its inner `runFfmpeg` helper routes
  through the central safe runner. Concat list generation escapes
  single quotes in file names before writing the concat list file.

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
