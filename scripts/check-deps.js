#!/usr/bin/env node
/**
 * Check system dependencies for mcp-video
 */

import { execSync } from 'child_process';

const deps = [
  { name: 'ffmpeg', cmd: 'ffmpeg -version', required: true },
  { name: 'ffprobe', cmd: 'ffprobe -version', required: true },
  { name: 'playwright browsers', cmd: 'npx playwright install --dry-run', required: false },
];

let allOk = true;

for (const dep of deps) {
  try {
    const output = execSync(dep.cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const version = output.split('\n')[0].trim();
    console.log(`  ${dep.name}: ${version}`);
  } catch {
    if (dep.required) {
      console.error(`  ${dep.name}: NOT FOUND (required)`);
      allOk = false;
    } else {
      console.warn(`  ${dep.name}: not available (optional)`);
    }
  }
}

if (!allOk) {
  console.error('\nMissing required dependencies. Install them:');
  console.error('  Ubuntu/Debian: sudo apt install ffmpeg');
  console.error('  macOS: brew install ffmpeg');
  console.error('  Windows: choco install ffmpeg');
  process.exit(1);
}

console.log('\nAll dependencies OK.');
