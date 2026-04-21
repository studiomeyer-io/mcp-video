import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, sanitizedError } from './error-sanitizer.js';

describe('error-sanitizer — sanitizeErrorMessage', () => {
  it('redacts Bearer tokens', () => {
    const out = sanitizeErrorMessage('Authorization: Bearer sk-abcDEF_123.456+XY/z==');
    expect(out).toContain('Bearer [REDACTED]');
    expect(out).not.toContain('sk-abcDEF');
  });

  it('redacts xi-api-key values (ElevenLabs style)', () => {
    const out = sanitizeErrorMessage('"xi-api-key": "abc123secret"');
    expect(out).toContain('"xi-api-key": "[REDACTED]"');
  });

  it('redacts x-api-key header values', () => {
    const out = sanitizeErrorMessage('x-api-key: verysecret123');
    expect(out).toMatch(/x-api-key:\s*\[REDACTED\]/);
  });

  it('redacts OpenAI-style sk- keys', () => {
    const out = sanitizeErrorMessage('key=sk-proj-abcdefghij1234567890abcdef');
    expect(out).toContain('sk-[REDACTED]');
  });

  it('redacts AWS access keys (AKIA...)', () => {
    const out = sanitizeErrorMessage('user=AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain('[REDACTED-AWS-KEY]');
  });

  it('redacts "api_key" JSON fields', () => {
    const out = sanitizeErrorMessage('{"api_key":"secret_value"}');
    expect(out).toContain('"api_key":"[REDACTED]"');
  });

  it('redacts apiKey JSON fields (camelCase)', () => {
    const out = sanitizeErrorMessage('{"apiKey": "hot"}');
    expect(out).toContain('"apiKey": "[REDACTED]"');
  });

  it('redacts signed S3 URLs', () => {
    const input =
      'https://s3.amazonaws.com/b/k?X-Amz-Signature=abc123xyz&other=1';
    const out = sanitizeErrorMessage(input);
    expect(out).toContain('X-Amz-Signature=[REDACTED]');
    expect(out).not.toContain('abc123xyz');
  });

  it('limits output length (default 300 chars, returns with ellipsis)', () => {
    const big = 'x'.repeat(5000);
    const out = sanitizeErrorMessage(big, { limit: 100 });
    expect(out.length).toBeLessThanOrEqual(101); // 100 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
  });

  it('collapses whitespace and trims', () => {
    const out = sanitizeErrorMessage('   some   messy\n\ttext   ');
    expect(out).toBe('some messy text');
  });

  it('supports a prefix that is not truncated by the limit', () => {
    const out = sanitizeErrorMessage('body', { prefix: 'ElevenLabs 401: ', limit: 300 });
    expect(out.startsWith('ElevenLabs 401: ')).toBe(true);
  });

  it('handles Error objects via .message', () => {
    const out = sanitizeErrorMessage(new Error('Bearer sk-abcdefghijklmnop'));
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('handles non-string non-Error values via String()', () => {
    const out = sanitizeErrorMessage({ toString: () => 'weird' });
    expect(out).toBe('weird');
  });
});

describe('error-sanitizer — sanitizedError', () => {
  it('returns an Error whose message is already sanitized', () => {
    const err = sanitizedError('Authorization: Bearer sk-123abcXYZ');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Bearer [REDACTED]');
  });

  it('applies a prefix when provided', () => {
    const err = sanitizedError('fail', 'OpenAI 500: ');
    expect(err.message.startsWith('OpenAI 500: ')).toBe(true);
  });
});
