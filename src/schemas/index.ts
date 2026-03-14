import { videoSchemas } from './video.js';
import { postProductionSchemas } from './post-production.js';
import { ttsSchemas } from './tts.js';
import { smartScreenshotSchemas } from './smart-screenshot.js';
import { editingSchemas } from './editing.js';
import { capcutSchemas } from './capcut.js';

export const TOOLS = [
  ...videoSchemas,
  ...postProductionSchemas,
  ...ttsSchemas,
  ...smartScreenshotSchemas,
  ...editingSchemas,
  ...capcutSchemas,
];
