/**
 * Text overlay engine — animated titles, subtitles, watermarks
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export type TextPosition = 'center' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TextOverlay {
  /** Text to display */
  text: string;
  /** Position on screen (default: center) */
  position?: TextPosition;
  /** Font size (default: 48) */
  fontSize?: number;
  /** Font color (default: white) */
  fontColor?: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Fade in duration (default: 0.5s) */
  fadeIn?: number;
  /** Fade out duration (default: 0.5s) */
  fadeOut?: number;
  /** Background box behind text (default: false) */
  showBackground?: boolean;
  /** Background color (default: black@0.6) */
  backgroundColor?: string;
}

// ─── Position Resolver ──────────────────────────────────────────────

function resolvePosition(pos: TextPosition): { x: string; y: string } {
  switch (pos) {
    case 'top':          return { x: '(w-text_w)/2', y: 'h*0.08' };
    case 'bottom':       return { x: '(w-text_w)/2', y: 'h*0.88' };
    case 'top-left':     return { x: 'w*0.05',       y: 'h*0.05' };
    case 'top-right':    return { x: 'w-text_w-w*0.05', y: 'h*0.05' };
    case 'bottom-left':  return { x: 'w*0.05',       y: 'h-text_h-h*0.05' };
    case 'bottom-right': return { x: 'w-text_w-w*0.05', y: 'h-text_h-h*0.05' };
    default:             return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
  }
}

// ─── Filter Builder ─────────────────────────────────────────────────

function buildDrawtextFilter(overlay: TextOverlay, fontPath: string): string {
  const {
    text,
    position = 'center',
    fontSize = 48,
    fontColor = 'white',
    startTime,
    endTime,
    fadeIn = 0.5,
    fadeOut = 0.5,
    showBackground = false,
    backgroundColor = 'black@0.6',
  } = overlay;

  const { x, y } = resolvePosition(position);
  const fadeInEnd = startTime + fadeIn;
  const fadeOutStart = endTime - fadeOut;

  // Escape for ffmpeg
  const escaped = text.replace(/'/g, "\\\\'").replace(/:/g, '\\:');

  // Alpha expression: fade in → hold → fade out
  const alpha = `if(lt(t\\,${startTime})\\,0\\,if(lt(t\\,${fadeInEnd})\\,(t-${startTime})/${fadeIn}\\,if(lt(t\\,${fadeOutStart})\\,1\\,if(lt(t\\,${endTime})\\,(${endTime}-t)/${fadeOut}\\,0))))`;

  let filter = `drawtext=text='${escaped}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${x}:y=${y}:alpha='${alpha}':enable='between(t,${startTime},${endTime})'`;

  if (showBackground) {
    filter += `:box=1:boxcolor=${backgroundColor}:boxborderw=12`;
  }

  return filter;
}

// ─── Main Function ──────────────────────────────────────────────────

export async function addTextOverlays(
  inputPath: string,
  outputPath: string,
  overlays: TextOverlay[]
): Promise<string> {
  if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
  if (overlays.length === 0) throw new Error('No overlays provided');

  const fontPath = findFont();
  const filters = overlays.map((o) => buildDrawtextFilter(o, fontPath)).join(',');

  logger.info(`Adding ${overlays.length} text overlay(s)`);

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', filters,
    '-c:a', 'copy',
    '-c:v', 'libx264',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);

  logger.info(`Text overlays added: ${outputPath}`);
  return outputPath;
}

// ─── Helpers ────────────────────────────────────────────────────────

function findFont(): string {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
}

function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ffmpeg failed: ${stderr}`);
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}
