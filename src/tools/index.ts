// Core recording
export { recordWebsite } from './engine/index.js';
export type { RecordingConfig, RecordingResult, Scene, ViewportPreset, EasingName } from './engine/index.js';

// Post-production
export { addBackgroundMusic } from './engine/audio.js';
export type { AddMusicConfig } from './engine/audio.js';
export { concatenateVideos, generateIntro } from './engine/concat.js';
export type { ConcatConfig, ConcatClip, IntroConfig, TransitionType } from './engine/concat.js';
export { convertToSocialFormat, convertToAllFormats, SOCIAL_FORMATS } from './engine/social-format.js';
export type { SocialFormat, CropStrategy, FormatConvertConfig } from './engine/social-format.js';
export { addTextOverlays } from './engine/text-overlay.js';
export type { TextOverlay, TextPosition } from './engine/text-overlay.js';

// TTS & Narration
export { generateSpeech, listElevenLabsVoices } from './engine/tts.js';
export type { TTSConfig, TTSResult, TTSProvider, ElevenLabsVoice, OpenAIVoice } from './engine/tts.js';
export { createNarratedVideo } from './engine/narrated-video.js';
export type { NarratedVideoConfig, NarratedVideoResult, NarrationSegment } from './engine/narrated-video.js';

// Editing (NEW — CapCut-tier features)
export {
  adjustVideoSpeed,
  applyColorGrade,
  applyVideoEffect,
  cropVideo,
  reverseClip,
  extractAudio,
  burnSubtitles,
  autoCaption,
  addKeyframeAnimation,
  composePip,
  addAudioDucking,
} from './engine/editing.js';
export type {
  SpeedConfig,
  ColorGradeConfig,
  VideoEffect, EffectConfig,
  CropConfig,
  ReverseConfig,
  ExtractAudioConfig,
  BurnSubtitlesConfig,
  AutoCaptionConfig, AutoCaptionResult,
  Keyframe, KeyframeAnimationConfig,
  PipPosition, PipConfig,
  AudioDuckingConfig,
} from './engine/editing.js';

// CapCut-tier engines
export { applyLutPreset, listLutPresets, ALL_LUT_PRESETS, PRESET_DESCRIPTIONS } from './engine/lut-presets.js';
export type { LutPreset, LutPresetConfig } from './engine/lut-presets.js';
export { applyVoiceEffect, ALL_VOICE_EFFECTS, VOICE_EFFECT_DESCRIPTIONS } from './engine/voice-effects.js';
export type { VoiceEffect, VoiceEffectConfig } from './engine/voice-effects.js';
export { applyChromaKey } from './engine/chroma-key.js';
export type { ChromaKeyConfig } from './engine/chroma-key.js';
export { syncToBeats } from './engine/beat-sync.js';
export type { BeatSyncConfig, BeatSyncResult } from './engine/beat-sync.js';
export { animateText, ALL_TEXT_ANIMATIONS, TEXT_ANIMATION_DESCRIPTIONS } from './engine/text-animations.js';
export type { TextAnimation, TextAnimationConfig } from './engine/text-animations.js';
export { mixAudioTracks } from './engine/audio-mixer.js';
export type { AudioTrack, AudioMixConfig, AudioMixResult } from './engine/audio-mixer.js';

// Template engine
export { listTemplates, getTemplate, getTemplateSummaries, getTemplateCategories } from './engine/templates.js';
export type { VideoTemplate, TemplateCategory, TemplateSlot } from './engine/templates.js';
export { renderTemplate } from './engine/template-renderer.js';
export type { RenderTemplateConfig, RenderResult, TemplateAssets } from './engine/template-renderer.js';
