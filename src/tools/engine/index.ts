export { recordWebsite } from './capture.js';
export { encodeFrames, addFade, concatenateWithTransition, cleanupFrames } from './encoder.js';
export { getEasing, applyEasing, EASINGS } from './easing.js';
export { injectCursor, moveCursor, moveCursorToElement, animateClick, hideCursor } from './cursor.js';
export { executeScenes, createDefaultScenes } from './scenes.js';
export { addBackgroundMusic, getMediaDuration } from './audio.js';
export { concatenateVideos, generateIntro, TRANSITIONS } from './concat.js';
export { convertToSocialFormat, convertToAllFormats, SOCIAL_FORMATS } from './social-format.js';
export { addTextOverlays } from './text-overlay.js';
export { generateSpeech, listElevenLabsVoices } from './tts.js';
export { createNarratedVideo } from './narrated-video.js';
export { smartScreenshot } from './smart-screenshot.js';
export type { SmartScreenshotConfig, SmartScreenshotResult, SmartTarget, DetectedFeature } from './smart-screenshot.js';

// CapCut-tier engines
export { applyLutPreset, listLutPresets, ALL_LUT_PRESETS, PRESET_DESCRIPTIONS } from './lut-presets.js';
export type { LutPreset, LutPresetConfig } from './lut-presets.js';
export { applyVoiceEffect, ALL_VOICE_EFFECTS, VOICE_EFFECT_DESCRIPTIONS } from './voice-effects.js';
export type { VoiceEffect, VoiceEffectConfig } from './voice-effects.js';
export { applyChromaKey } from './chroma-key.js';
export type { ChromaKeyConfig } from './chroma-key.js';
export { syncToBeats } from './beat-sync.js';
export type { BeatSyncConfig, BeatSyncResult } from './beat-sync.js';
export { animateText, ALL_TEXT_ANIMATIONS, TEXT_ANIMATION_DESCRIPTIONS } from './text-animations.js';
export type { TextAnimation, TextAnimationConfig, TextPosition as AnimTextPosition } from './text-animations.js';
export { mixAudioTracks } from './audio-mixer.js';
export type { AudioTrack, AudioMixConfig, AudioMixResult } from './audio-mixer.js';
export { listTemplates, getTemplate, getTemplateSummaries, getTemplateCategories } from './templates.js';
export type { VideoTemplate, TemplateCategory, TemplateSlot } from './templates.js';
export { renderTemplate } from './template-renderer.js';
export type { RenderTemplateConfig, RenderResult, TemplateAssets } from './template-renderer.js';

export * from './types.js';
