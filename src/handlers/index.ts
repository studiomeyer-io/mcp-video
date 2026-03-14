import { type ToolHandler, type ToolResponse } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import { videoHandlers } from './video.js';
import { postProductionHandlers } from './post-production.js';
import { ttsHandlers } from './tts.js';
import { smartScreenshotHandlers } from './smart-screenshot.js';
import { editingHandlers } from './editing.js';
import { capcutHandlers } from './capcut.js';

const HANDLER_REGISTRY: Record<string, ToolHandler> = {
  ...videoHandlers,
  ...postProductionHandlers,
  ...ttsHandlers,
  ...smartScreenshotHandlers,
  ...editingHandlers,
  ...capcutHandlers,
};

export async function handleToolCall(name: string, args: unknown): Promise<ToolResponse> {
  const handler = HANDLER_REGISTRY[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    return await handler(args);
  } catch (error) {
    logger.logError('Tool execution failed', error, { tool: name });
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: message, code: 'INTERNAL_ERROR' }, null, 2) }],
      isError: true,
    };
  }
}
