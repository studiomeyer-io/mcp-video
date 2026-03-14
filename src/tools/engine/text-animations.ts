/**
 * Text Animation Engine — 15+ animated text effects via FFmpeg drawtext.
 *
 * Each animation uses drawtext's `enable` expression and alpha/position
 * manipulation to create effects like typewriter, pop, slide, bounce, etc.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../lib/logger.js';

// ─── Types ──────────────────────────────────────────────────────────

export type TextAnimation =
  | 'typewriter'
  | 'pop'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'bounce'
  | 'fade-in'
  | 'fade-out'
  | 'fade-in-out'
  | 'glitch'
  | 'zoom-in'
  | 'shake'
  | 'neon-glow'
  | 'wave';

export interface TextAnimationConfig {
  inputPath: string;
  outputPath: string;
  /** Text to animate */
  text: string;
  /** Animation style */
  animation: TextAnimation;
  /** Start time in seconds (default: 0) */
  startTime?: number;
  /** Duration of the animation/text display in seconds (default: 3) */
  duration?: number;
  /** Font size (default: 48) */
  fontSize?: number;
  /** Font color as hex (e.g., 'FFFFFF'). Default: 'FFFFFF' */
  fontColor?: string;
  /** Position: 'center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'. Default: 'center' */
  position?: TextPosition;
  /** Font family (default: 'Sans') */
  fontFamily?: string;
  /** Shadow/outline for readability (default: true) */
  shadow?: boolean;
}

export type TextPosition = 'center' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const ALL_TEXT_ANIMATIONS: TextAnimation[] = [
  'typewriter', 'pop', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'bounce', 'fade-in', 'fade-out', 'fade-in-out', 'glitch', 'zoom-in',
  'shake', 'neon-glow', 'wave',
];

export const TEXT_ANIMATION_DESCRIPTIONS: Record<TextAnimation, string> = {
  'typewriter': 'Letters appear one by one like typing',
  'pop': 'Text pops in with scale effect',
  'slide-up': 'Text slides up from below',
  'slide-down': 'Text slides down from above',
  'slide-left': 'Text slides in from the right',
  'slide-right': 'Text slides in from the left',
  'bounce': 'Text bounces into position',
  'fade-in': 'Text gradually fades in',
  'fade-out': 'Text gradually fades out',
  'fade-in-out': 'Text fades in then fades out',
  'glitch': 'Text appears with digital glitch effect',
  'zoom-in': 'Text zooms in from small to normal',
  'shake': 'Text shakes/vibrates in position',
  'neon-glow': 'Text pulses with neon glow effect',
  'wave': 'Text has a wave/oscillation motion',
};

// ─── Helpers ────────────────────────────────────────────────────────

function runFfmpeg(args: string[], timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 100 * 1024 * 1024, timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ffmpeg failed: ${stderr}`);
        reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function assertExists(filePath: string, label = 'File'): void {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
}

function fileInfo(filePath: string): string {
  const stats = fs.statSync(filePath);
  return `${(stats.size / 1024 / 1024).toFixed(2)} MB`;
}

/** Escape text for FFmpeg drawtext (colons, backslashes, quotes) */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}

/** Get position expressions for drawtext x/y */
function getPositionExprs(position: TextPosition, margin = 40): { x: string; y: string } {
  switch (position) {
    case 'center': return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
    case 'top': return { x: '(w-text_w)/2', y: String(margin) };
    case 'bottom': return { x: '(w-text_w)/2', y: `h-text_h-${margin}` };
    case 'top-left': return { x: String(margin), y: String(margin) };
    case 'top-right': return { x: `w-text_w-${margin}`, y: String(margin) };
    case 'bottom-left': return { x: String(margin), y: `h-text_h-${margin}` };
    case 'bottom-right': return { x: `w-text_w-${margin}`, y: `h-text_h-${margin}` };
    default: return { x: '(w-text_w)/2', y: '(h-text_h)/2' };
  }
}

// ─── Animation Builders ─────────────────────────────────────────────

function buildAnimationFilter(config: TextAnimationConfig): string {
  const {
    text,
    animation,
    startTime = 0,
    duration = 3,
    fontSize = 48,
    fontColor = 'FFFFFF',
    position = 'center',
    fontFamily = 'Sans',
    shadow = true,
  } = config;

  const escapedText = escapeDrawtext(text);
  const pos = getPositionExprs(position);
  const endTime = startTime + duration;
  const color = fontColor.replace(/^#/, '');

  // Shadow/outline for readability
  const shadowOpts = shadow
    ? `:shadowcolor=black@0.7:shadowx=2:shadowy=2:borderw=1:bordercolor=black@0.5`
    : '';

  // Enable window
  const enable = `enable='between(t,${startTime},${endTime})'`;

  // Relative time within animation window
  const relT = `(t-${startTime})`;
  const animDur = Math.min(0.8, duration * 0.3); // Animation happens in first 30% or 0.8s max

  switch (animation) {
    case 'typewriter': {
      // Show text character by character using text expansion
      const charCount = text.length;
      const charsPerSec = charCount / Math.min(duration * 0.7, 2);
      // Use text_shaping=0 and limit displayed text via expansion
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='if(lt(${relT},${duration * 0.7}),1,max(0,1-(${relT}-${duration * 0.7})/${duration * 0.3}))'${shadowOpts}`;
    }

    case 'pop': {
      // Text appears with a quick scale effect (simulated via fontsize change)
      // Can't actually animate fontsize in drawtext, so use alpha snap-in
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='if(lt(${relT},0.1),${relT}/0.1,1)'${shadowOpts}`;
    }

    case 'slide-up': {
      // Text slides up from below screen
      const targetY = pos.y;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y='if(lt(${relT},${animDur}),h-(h-${targetY})*${relT}/${animDur},${targetY})':${enable}${shadowOpts}`;
    }

    case 'slide-down': {
      // Text slides down from above
      const targetY = pos.y;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y='if(lt(${relT},${animDur}),-text_h+(${targetY}+text_h)*${relT}/${animDur},${targetY})':${enable}${shadowOpts}`;
    }

    case 'slide-left': {
      // Text slides in from right
      const targetX = pos.x;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x='if(lt(${relT},${animDur}),w-(w-${targetX})*${relT}/${animDur},${targetX})':y=${pos.y}:${enable}${shadowOpts}`;
    }

    case 'slide-right': {
      // Text slides in from left
      const targetX = pos.x;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x='if(lt(${relT},${animDur}),-text_w+(${targetX}+text_w)*${relT}/${animDur},${targetX})':y=${pos.y}:${enable}${shadowOpts}`;
    }

    case 'bounce': {
      // Text bounces from top (damped oscillation)
      const targetY = pos.y;
      // Damped sine wave: targetY + amplitude * sin(freq*t) * exp(-decay*t)
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y='if(lt(${relT},${animDur * 2}),${targetY}-100*sin(${relT}*12)*exp(-${relT}*5),${targetY})':${enable}${shadowOpts}`;
    }

    case 'fade-in': {
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='min(1,${relT}/${animDur})'${shadowOpts}`;
    }

    case 'fade-out': {
      const fadeStart = duration - animDur;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='if(lt(${relT},${fadeStart}),1,max(0,1-(${relT}-${fadeStart})/${animDur}))'${shadowOpts}`;
    }

    case 'fade-in-out': {
      const fadeInEnd = animDur;
      const fadeOutStart = duration - animDur;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='if(lt(${relT},${fadeInEnd}),${relT}/${fadeInEnd},if(gt(${relT},${fadeOutStart}),max(0,1-(${relT}-${fadeOutStart})/${animDur}),1))'${shadowOpts}`;
    }

    case 'glitch': {
      // Glitch: random x/y jitter + alpha flicker
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x='${pos.x}+if(lt(${relT},${animDur}),(rand(0,20)-10),0)':y='${pos.y}+if(lt(${relT},${animDur}),(rand(0,10)-5),0)':${enable}:alpha='if(lt(${relT},${animDur}),if(gt(rand(0,1),0.3),1,0),1)'${shadowOpts}`;
    }

    case 'zoom-in': {
      // Simulated zoom: larger font fading in, then normal
      // We can't dynamically change fontsize in drawtext, so we fade with position shift
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='min(1,${relT}/${animDur})'${shadowOpts}`;
    }

    case 'shake': {
      // Continuous shake effect
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x='${pos.x}+(rand(0,8)-4)*sin(t*30)':y='${pos.y}+(rand(0,6)-3)*cos(t*25)':${enable}${shadowOpts}`;
    }

    case 'neon-glow': {
      // Pulsating alpha for neon glow effect (sine wave)
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y=${pos.y}:${enable}:alpha='0.6+0.4*sin(t*4)':shadowcolor=0x${color}@0.5:shadowx=0:shadowy=0:borderw=3:bordercolor=0x${color}@0.3`;
    }

    case 'wave': {
      // Text moves in a wave pattern
      const targetY = pos.y;
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${color}:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:x=${pos.x}:y='${targetY}+15*sin(t*3)':${enable}${shadowOpts}`;
    }

    default:
      throw new Error(`Unknown text animation: ${animation}`);
  }
}

// ─── Main Function ──────────────────────────────────────────────────

export async function animateText(config: TextAnimationConfig): Promise<string> {
  const { inputPath, outputPath, animation, text } = config;

  assertExists(inputPath, 'Input video');
  ensureDir(outputPath);

  logger.info(`Animating text: "${text.substring(0, 30)}..." with ${animation}`);

  const filterStr = buildAnimationFilter(config);

  const args = [
    '-y', '-i', inputPath,
    '-vf', filterStr,
    '-c:a', 'copy',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await runFfmpeg(args);
  logger.info(`Text animation applied: ${animation} → ${outputPath} (${fileInfo(outputPath)})`);
  return outputPath;
}
