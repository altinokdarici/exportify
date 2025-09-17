import { describe, it, expect } from '@jest/globals';
import { normalizeRelativePath } from './normalizeRelativePath.js';

describe('normalizeRelativePath', () => {
  it('adds ./ prefix to paths without it', () => {
    expect(normalizeRelativePath('lib/index.js')).toBe('./lib/index.js');
    expect(normalizeRelativePath('index.js')).toBe('./index.js');
    expect(normalizeRelativePath('src/utils/helper.js')).toBe('./src/utils/helper.js');
  });

  it('preserves paths that already have ./ prefix', () => {
    expect(normalizeRelativePath('./lib/index.js')).toBe('./lib/index.js');
    expect(normalizeRelativePath('./index.js')).toBe('./index.js');
    expect(normalizeRelativePath('./src/utils/helper.js')).toBe('./src/utils/helper.js');
  });

  it('handles empty and edge case paths', () => {
    expect(normalizeRelativePath('')).toBe('./');
    expect(normalizeRelativePath('.')).toBe('./.');
  });
});
