# mcp-video — Usage Guide

**Version:** 1.0.0
**Tools:** 8 (consolidated from 33)

---

## Quick Start

```bash
npm run build
npm start          # stdio
npm run dev        # Dev mode
npm test           # Tests
```

---

## Tools (8)

### 1. `video_record` — Record website videos

```json
{ "type": "cinema", "url": "https://example.com", "fps": 60, "scenes": [...] }
{ "type": "scroll", "url": "https://example.com", "duration": 12 }
{ "type": "multi-device", "url": "https://example.com", "devices": ["desktop", "tablet", "mobile"] }
```

Types: `cinema` (full control), `scroll` (quick scroll-through), `multi-device` (all viewports)

---

### 2. `video_edit` — Edit video clips

```json
{ "type": "speed", "inputPath": "/path/video.mp4", "outputPath": "/path/out.mp4", "speed": 0.5 }
{ "type": "crop", "inputPath": "...", "width": 1080, "height": 1080 }
{ "type": "reverse", "inputPath": "..." }
{ "type": "keyframe", "inputPath": "...", "keyframes": [...] }
{ "type": "pip", "mainVideo": "...", "overlayVideo": "...", "position": "bottom-right" }
```

Types: `speed`, `crop`, `reverse`, `keyframe`, `pip`

---

### 3. `video_color` — Color grading & effects

```json
{ "type": "grade", "inputPath": "...", "brightness": 1.1, "contrast": 1.2 }
{ "type": "effect", "inputPath": "...", "effect": "blur", "intensity": 0.5 }
{ "type": "lut", "inputPath": "...", "preset": "film-noir", "intensity": 0.8 }
{ "type": "chroma", "inputPath": "...", "background": "/path/bg.mp4" }
```

Types: `grade`, `effect` (blur/sharpen/vignette/grayscale/sepia/noise/glow), `lut` (22 presets), `chroma`

---

### 4. `video_audio` — Audio operations

```json
{ "type": "extract", "inputPath": "...", "format": "mp3" }
{ "type": "music", "videoPath": "...", "musicPath": "...", "musicVolume": 0.25 }
{ "type": "ducking", "inputPath": "...", "duckLevel": 0.3 }
{ "type": "mix", "tracks": [...], "outputPath": "..." }
{ "type": "voice", "inputPath": "...", "effect": "echo" }
```

Types: `extract`, `music`, `ducking`, `mix`, `voice` (echo/reverb/deep/chipmunk/robot/whisper/radio/megaphone/underwater)

---

### 5. `video_text` — Text & captions

```json
{ "type": "subtitles", "inputPath": "...", "subtitlePath": "/path/subs.srt" }
{ "type": "caption", "inputPath": "...", "language": "de" }
{ "type": "overlay", "inputPath": "...", "overlays": [...] }
{ "type": "animate", "inputPath": "...", "text": "Hello", "animation": "typewriter" }
```

Types: `subtitles`, `caption` (Whisper AI), `overlay`, `animate` (15 styles)

---

### 6. `video_compose` — Compose & export

```json
{ "type": "concat", "clips": [...], "transition": "fade" }
{ "type": "intro", "text": "My Brand", "duration": 3 }
{ "type": "social", "inputPath": "...", "format": "instagram-reel" }
{ "type": "social-all", "inputPath": "..." }
{ "type": "beat-sync", "audioPath": "...", "clips": [...] }
{ "type": "templates" }
{ "type": "render", "templateId": "social-reel-1", "assets": {...} }
```

Types: `concat`, `intro`, `social`, `social-all`, `beat-sync`, `templates`, `render`

---

### 7. `video_speech` — TTS & narration

```json
{ "type": "generate", "text": "Hello world", "provider": "elevenlabs" }
{ "type": "voices" }
{ "type": "narrated", "url": "https://example.com", "segments": [...] }
```

Types: `generate` (ElevenLabs/OpenAI), `voices` (list available), `narrated` (full narrated video)

---

### 8. `video_screenshot` — Smart screenshots

```json
{ "type": "capture", "url": "https://example.com", "targets": ["hero", "pricing"] }
{ "type": "detect", "url": "https://example.com" }
```

Types: `capture` (element-aware screenshots), `detect` (page feature analysis)

---

## Typical Workflows

### Product demo video
1. `video_record` (type: cinema) → Record website
2. `video_edit` (type: keyframe) → Add zoom/pan
3. `video_text` (type: caption) → Auto-caption
4. `video_audio` (type: music) → Background music
5. `video_compose` (type: social-all) → Export all formats

### Quick social reel
1. `video_record` (type: scroll) → Scroll recording
2. `video_color` (type: lut) → Cinema color grade
3. `video_compose` (type: beat-sync) → Sync to music
4. `video_compose` (type: social) → Instagram reel format

### Narrated walkthrough
1. `video_speech` (type: narrated) → Full narrated video
2. `video_text` (type: overlay) → Title cards
3. `video_compose` (type: intro) → Add intro/outro
