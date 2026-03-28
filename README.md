<div align="center">

# mcp-video

**Cinema-grade video production for AI agents.**

![CI](https://github.com/studiomeyer-io/mcp-video/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
[![npm version](https://img.shields.io/npm/v/mcp-video?color=blue)](https://www.npmjs.com/package/mcp-video)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

8 MCP tools for recording, editing, effects, captions, TTS, and smart screenshots.<br>
Built on [ffmpeg](https://ffmpeg.org/) and [Playwright](https://playwright.dev/). Works with any MCP client.

[Features](#features) · [Quick Start](#quick-start) · [Examples](#usage-examples) · [Architecture](#architecture)

</div>

## Features

| Tool | Operations | Description |
|------|-----------|-------------|
| `video_record` | cinema, scroll, multi-device | Record websites at 60fps with frame-by-frame capture |
| `video_edit` | speed, crop, reverse, keyframe, pip | Edit clips with zoom/pan, PiP, slow-mo |
| `video_color` | grade, effect, lut, chroma | Color grading, 22 LUT presets, green screen |
| `video_audio` | extract, music, ducking, mix, voice | Audio extraction, mixing, 9 voice effects |
| `video_text` | subtitles, caption, overlay, animate | Burn SRT, Whisper auto-caption, 15 text animations |
| `video_compose` | concat, intro, social, beat-sync, templates | Join clips, social format conversion, beat sync |
| `video_speech` | generate, voices, narrated | ElevenLabs/OpenAI TTS, full narrated videos |
| `video_screenshot` | capture, detect | Element-aware screenshots, page feature detection |

### Highlights

- **60fps frame-by-frame capture** — Playwright screenshots every frame, ffmpeg encodes. Zero frame drops.
- **Cinema easing curves** — 16 easing options including `cinematic` and `showcase` for buttery smooth scrolling.
- **Smart screenshots** — Auto-detects 15+ UI elements (chat widgets, pricing sections, booking forms, etc.).
- **Narrated videos** — Provide a URL + script, get a professional video with synchronized AI voiceover.
- **22 LUT presets** — Film-grade color grading (teal-orange, noir, vintage, cyberpunk, etc.).
- **Social format export** — One-click conversion to Instagram Reel, TikTok, YouTube Short, LinkedIn.
- **Dual transport** — Stdio (default) or HTTP mode for persistent microservice deployment.

## Prerequisites

- **Node.js** >= 18
- **ffmpeg** and **ffprobe** (validated on startup)
- **Playwright** browsers (`npx playwright install chromium`)
- Optional: `ELEVENLABS_API_KEY` for ElevenLabs TTS
- Optional: `OPENAI_API_KEY` for Whisper captions and OpenAI TTS

## Quick Start

### With Claude Code (stdio)

```json
{
  "mcpServers": {
    "video": {
      "command": "npx",
      "args": ["-y", "mcp-video"]
    }
  }
}
```

### With npx

```bash
npx mcp-video
```

### From source

```bash
git clone https://github.com/studiomeyer-io/mcp-video.git
cd mcp-video
npm install
npx playwright install chromium
npm run build
npm start
```

### HTTP mode

```bash
# Start as HTTP microservice
npx mcp-video --http --port=9847

# Or via environment variables
MCP_HTTP=1 MCP_PORT=9847 npx mcp-video
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VIDEO_OUTPUT_DIR` | `./output` | Directory for generated files |
| `ELEVENLABS_API_KEY` | — | ElevenLabs TTS API key |
| `OPENAI_API_KEY` | — | OpenAI API key (Whisper + TTS) |
| `MCP_HTTP` | `false` | Enable HTTP transport |
| `MCP_PORT` | `9847` | HTTP port |
| `MCP_HOST` | `127.0.0.1` | HTTP bind address |
| `MCP_VIDEO_DEBUG` | `false` | Enable debug logging |

## What You Can Build

| Use Case | Tools Used | Output |
|----------|-----------|--------|
| **Product demo video** | `video_record` → `video_text` → `video_audio` | 60fps website recording + auto-captions + background music |
| **Social media clips** | `video_record` → `video_compose` | Record once → export to Instagram Reel, TikTok, YouTube Short |
| **Narrated explainer** | `video_speech` → `video_color` | AI voiceover + cinematic color grade |
| **Before/after comparison** | `video_screenshot` → `video_edit` | Smart element screenshots + PiP composition |
| **Automated QA** | `video_record` + `video_screenshot` | Record user flows + screenshot specific elements |

## Usage Examples

### Record a website

```
Use video_record with type "cinema" to record https://example.com
with a smooth scroll and hover over the navbar.
```

### Create a narrated explainer video

```
Use video_speech with type "narrated" to create a narrated video of
https://example.com with these segments:
1. "Welcome to our homepage" — pause on hero section
2. "Check out our features" — scroll to features
3. "Get started today" — hover over CTA button
```

### Auto-caption a video

```
Use video_text with type "caption" to add auto-generated captions
to /path/to/video.mp4
```

### Export for social media

```
Use video_compose with type "social-all" to convert
/path/to/video.mp4 to all social media formats.
```

### Smart screenshot

```
Use video_screenshot with type "capture" to screenshot the chat widget
and pricing section on https://example.com
```

## Architecture

```
src/
  server.ts            Entry point, 8 consolidated MCP tools
  lib/                 Logger, types, dual transport
  handlers/            Tool handlers (video, editing, post-production, tts, screenshots)
  schemas/             JSON Schema definitions for legacy tool format
  tools/
    engine/            Core engines
      capture.ts       Frame-by-frame recording (Playwright → PNG → ffmpeg)
      encoder.ts       ffmpeg encoding pipeline
      scenes.ts        Scene execution (scroll, hover, click, type, wait)
      cursor.ts        Visible cursor simulation
      smart-screenshot.ts  Element-aware screenshot engine
      tts.ts           ElevenLabs + OpenAI TTS with fallback
      narrated-video.ts    Full narration pipeline
      social-format.ts     Social media format conversion
      concat.ts        Video concatenation with transitions
      lut-presets.ts   22 cinema LUT presets
      ...and more
```

## Development

```bash
npm run dev          # Start with tsx (hot reload)
npm run typecheck    # Type check
npm test             # Run tests
npm run check        # Verify ffmpeg/ffprobe installed
```

## License

MIT

## Credits

Built by [StudioMeyer](https://studiomeyer.io). Part of our open-source toolkit for AI-powered content creation.

- [ai-shield](https://github.com/studiomeyer-io/ai-shield) — LLM security middleware for TypeScript
- [agent-fleet](https://github.com/studiomeyer-io/agent-fleet) — Multi-agent orchestration for Claude Code
- [darwin-agents](https://github.com/studiomeyer-io/darwin-agents) — Self-evolving agent framework
