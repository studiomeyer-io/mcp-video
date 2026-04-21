import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withTempDir, makeTempDir } from './temp-dir.js';

describe('temp-dir — withTempDir', () => {
  it('creates a unique directory per call', async () => {
    const dirs = await Promise.all([
      withTempDir('parallel-', async (d) => d),
      withTempDir('parallel-', async (d) => d),
      withTempDir('parallel-', async (d) => d),
    ]);
    expect(new Set(dirs).size).toBe(3);
    for (const d of dirs) {
      expect(fsSync.existsSync(d)).toBe(false); // already cleaned
    }
  });

  it('cleans up after the callback resolves', async () => {
    let captured = '';
    await withTempDir('cleanup-ok-', async (dir) => {
      captured = dir;
      expect(fsSync.existsSync(dir)).toBe(true);
      await fs.writeFile(join(dir, 'x.txt'), 'hi');
    });
    expect(fsSync.existsSync(captured)).toBe(false);
  });

  it('cleans up even when the callback throws', async () => {
    let captured = '';
    await expect(
      withTempDir('cleanup-fail-', async (dir) => {
        captured = dir;
        await fs.writeFile(join(dir, 'y.txt'), 'bye');
        throw new Error('simulated');
      })
    ).rejects.toThrow('simulated');
    expect(fsSync.existsSync(captured)).toBe(false);
  });

  it('creates a subdirectory under os.tmpdir()', async () => {
    await withTempDir('under-tmpdir-', async (dir) => {
      expect(dir.startsWith(tmpdir())).toBe(true);
    });
  });

  it('sanitizes unsafe characters in the prefix (no traversal literal)', async () => {
    await withTempDir('../../etc/passwd', async (dir) => {
      // mkdtemp + join(tmpdir(), ...) already prevent real traversal; we
      // additionally scrub `..` out of the literal segment for tidy
      // audit logs.
      expect(dir.startsWith(tmpdir())).toBe(true);
      expect(dir.includes('..')).toBe(false);
      expect(dir).toMatch(/etc-passwd-/);
    });
  });

  it('returns the value from the callback', async () => {
    const result = await withTempDir('value-', async () => 'ok');
    expect(result).toBe('ok');
  });
});

describe('temp-dir — makeTempDir', () => {
  it('returns a path that exists and can be manually cleaned', async () => {
    const dir = await makeTempDir('manual-');
    try {
      expect(fsSync.existsSync(dir)).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
