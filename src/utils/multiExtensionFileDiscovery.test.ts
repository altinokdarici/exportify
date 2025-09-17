import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  discoverFiles,
  findBestMatch,
  resolveModulePath,
  getFileVariations,
  analyzeDiscoveryStats,
  DEFAULT_CONFIGS,
} from './multiExtensionFileDiscovery.js';

describe('Multi-extension file discovery', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'multi-ext-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('discoverFiles', () => {
    it('finds exact file path when extension provided', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'export {};');

      const result = discoverFiles('lib/utils.js', tempDir);

      expect(result).toEqual({
        filePath: 'lib/utils.js',
        discoveryType: 'exact',
        alternatives: ['lib/utils.js'],
        matchedExtension: '.js',
      });
    });

    it('discovers file with extension matching', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'component.tsx'), 'export {};');

      const result = discoverFiles('lib/component', tempDir, DEFAULT_CONFIGS.typescript);

      expect(result).toEqual({
        filePath: 'lib/component.tsx',
        discoveryType: 'extension',
        alternatives: expect.arrayContaining(['lib/component.tsx']),
        matchedExtension: '.tsx',
      });
    });

    it('finds index file in directory', async () => {
      await mkdir(join(tempDir, 'lib', 'utils'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils', 'index.ts'), 'export {};');

      const result = discoverFiles('lib/utils', tempDir, DEFAULT_CONFIGS.typescript);

      expect(result.discoveryType).toBe('index');
      expect(result.filePath).toContain('index.ts');
      expect(result.matchedExtension).toBe('.ts');
    });

    it('respects extension priority order', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'module.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'module.ts'), 'export {};');

      const result = discoverFiles('lib/module', tempDir, DEFAULT_CONFIGS.typescript);

      expect(result.filePath).toBe('lib/module.ts');
      expect(result.matchedExtension).toBe('.ts');
    });

    it('searches across multiple directories', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'component.tsx'), 'export {};');

      const result = discoverFiles('component', tempDir, {
        extensions: ['.ts', '.tsx', '.js'],
        tryIndexFiles: false,
        searchDirs: ['lib', 'src'],
        preserveStructure: false,
      });

      expect(result.filePath).toBe('src/component.tsx');
      expect(result.discoveryType).toBe('extension');
    });

    it('returns none when no files found', async () => {
      const result = discoverFiles('nonexistent', tempDir);

      expect(result.discoveryType).toBe('none');
      expect(result.filePath).toBeUndefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('findBestMatch', () => {
    it('finds best matching file for import path', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'export {};');

      const result = findBestMatch('utils', tempDir, 'javascript');
      expect(result).toBe('lib/utils.js');
    });

    it('returns null when no match found', async () => {
      const result = findBestMatch('nonexistent', tempDir);
      expect(result).toBeNull();
    });
  });

  describe('resolveModulePath', () => {
    it('resolves direct file path', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'module.js'), 'export {};');

      const result = resolveModulePath('module', tempDir);
      expect(result).toBe('lib/module.js');
    });

    it('resolves directory with index file', async () => {
      await mkdir(join(tempDir, 'lib', 'components'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'components', 'index.ts'), 'export {};');

      const result = resolveModulePath('components', tempDir);
      expect(result).toContain('components/index.ts');
    });

    it('returns null for unresolvable paths', async () => {
      const result = resolveModulePath('nonexistent/path', tempDir);
      expect(result).toBeNull();
    });
  });

  describe('getFileVariations', () => {
    it('generates all possible file variations', () => {
      const variations = getFileVariations('utils/helper', {
        extensions: ['.js', '.ts'],
        tryIndexFiles: true,
        searchDirs: ['lib', 'src'],
        preserveStructure: true,
      });

      expect(variations).toContain('lib/utils/helper.js');
      expect(variations).toContain('lib/utils/helper.ts');
      expect(variations).toContain('src/utils/helper.js');
      expect(variations).toContain('src/utils/helper.ts');
      expect(variations).toContain('lib/utils/helper/index.js');
      expect(variations).toContain('lib/utils/helper/index.ts');
    });

    it('handles flat structure when preserveStructure is false', () => {
      const variations = getFileVariations('utils/helper', {
        extensions: ['.js'],
        tryIndexFiles: false,
        searchDirs: ['lib'],
        preserveStructure: false,
      });

      expect(variations).toContain('lib/helper.js');
      expect(variations).not.toContain('lib/utils/helper.js');
    });
  });

  describe('analyzeDiscoveryStats', () => {
    it('analyzes discovery success rates', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'existing1.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'existing2.ts'), 'export {};');

      const importPaths = ['existing1', 'existing2', 'nonexistent1', 'nonexistent2'];
      const stats = analyzeDiscoveryStats(tempDir, importPaths);

      expect(stats.totalPaths).toBe(4);
      expect(stats.foundPaths).toBe(2);
      expect(stats.successRate).toBe(50);
      expect(stats.missingPaths).toEqual(['nonexistent1', 'nonexistent2']);
      expect(stats.discoveryTypes).toHaveProperty('extension');
    });

    it('handles empty input', () => {
      const stats = analyzeDiscoveryStats(tempDir, []);

      expect(stats.totalPaths).toBe(0);
      expect(stats.foundPaths).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.missingPaths).toEqual([]);
    });
  });
});
