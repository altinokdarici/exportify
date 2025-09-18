import { beforeEach, afterEach, describe, it, expect } from '@jest/globals';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { expandUsageWithPattern } from './expandUsageWithPattern.js';
import type { BuildPattern } from '../analysis/detectBuildPattern.js';

const testDir = join(process.cwd(), 'tmp-expand-test');

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('expandUsageWithPattern', () => {
  describe('no expansion cases', () => {
    it('returns null when pattern has no multiple builds', () => {
      const pattern: BuildPattern = {
        hasMultipleBuilds: false,
        patternType: 'none',
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);
      expect(result).toBeNull();
    });

    it('returns null when pattern is missing patterns', () => {
      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        // Missing cjsPattern and esmPattern
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);
      expect(result).toBeNull();
    });
  });

  describe('directory pattern expansion', () => {
    it('expands directory delta with existing files', async () => {
      // Create test files
      await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
      await mkdir(join(testDir, 'lib', 'esm'), { recursive: true });
      await mkdir(join(testDir, 'src'), { recursive: true });

      await writeFile(join(testDir, 'lib', 'cjs', 'utils.js'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib', 'esm', 'utils.js'), 'export {};');
      await writeFile(join(testDir, 'lib', 'utils.d.ts'), 'export {};');
      await writeFile(join(testDir, 'src', 'utils.ts'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);

      expect(result).toEqual({
        source: './src/utils.ts',
        types: './lib/utils.d.ts',
        import: './lib/esm/utils.js',
        require: './lib/cjs/utils.js',
        default: './lib/esm/utils.js',
      });
    });

    it('handles index files in directories', async () => {
      await mkdir(join(testDir, 'lib', 'cjs', 'components'), { recursive: true });
      await mkdir(join(testDir, 'lib', 'esm', 'components'), { recursive: true });

      await writeFile(
        join(testDir, 'lib', 'cjs', 'components', 'index.js'),
        'module.exports = {};'
      );
      await writeFile(join(testDir, 'lib', 'esm', 'components', 'index.js'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/components', pattern, testDir);

      expect(result).toEqual({
        import: './lib/esm/components/index.js',
        require: './lib/cjs/components/index.js',
        default: './lib/esm/components/index.js',
      });
    });

    it('works with partial file existence', async () => {
      await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
      await writeFile(join(testDir, 'lib', 'cjs', 'utils.js'), 'module.exports = {};');
      // No ESM file exists

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);

      expect(result).toEqual({
        require: './lib/cjs/utils.js',
        default: './lib/cjs/utils.js',
      });
    });
  });

  describe('extension pattern expansion', () => {
    it('expands extension delta with existing files', async () => {
      await mkdir(join(testDir, 'lib'), { recursive: true });
      await writeFile(join(testDir, 'lib', 'utils.cjs'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib', 'utils.mjs'), 'export {};');
      await writeFile(join(testDir, 'lib', 'utils.d.ts'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'extension',
        cjsPattern: {
          basePath: './lib/utils',
          identifier: '.cjs',
        },
        esmPattern: {
          basePath: './lib/utils',
          identifier: '.mjs',
        },
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);

      expect(result).toEqual({
        types: './lib/utils.d.ts',
        import: './lib/utils.mjs',
        require: './lib/utils.cjs',
        default: './lib/utils.mjs',
      });
    });
  });

  describe('prefix pattern expansion', () => {
    it('expands prefix delta with existing files', async () => {
      await mkdir(join(testDir, 'lib'), { recursive: true });
      await writeFile(join(testDir, 'lib', 'cjs.utils.js'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib', 'esm.utils.js'), 'export {};');
      await writeFile(join(testDir, 'lib', 'utils.d.ts'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'prefix',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);

      expect(result).toEqual({
        types: './lib/utils.d.ts',
        import: './lib/esm.utils.js',
        require: './lib/cjs.utils.js',
        default: './lib/esm.utils.js',
      });
    });

    it('handles nested directory prefix patterns', async () => {
      await mkdir(join(testDir, 'dist', 'components'), { recursive: true });
      await writeFile(join(testDir, 'dist', 'components', 'cjs.button.js'), 'module.exports = {};');
      await writeFile(join(testDir, 'dist', 'components', 'esm.button.js'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'prefix',
        cjsPattern: {
          basePath: './dist',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './dist',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./dist/components/button.js', pattern, testDir);

      expect(result).toEqual({
        import: './dist/components/esm.button.js',
        require: './dist/components/cjs.button.js',
        default: './dist/components/esm.button.js',
      });
    });
  });

  describe('edge cases', () => {
    it('returns null when no files exist', async () => {
      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/nonexistent.js', pattern, testDir);
      expect(result).toBeNull();
    });

    it('handles different file extensions correctly', async () => {
      await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
      await mkdir(join(testDir, 'lib', 'esm'), { recursive: true });

      await writeFile(join(testDir, 'lib', 'cjs', 'utils.cjs'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib', 'esm', 'utils.mjs'), 'export {};');

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/utils', pattern, testDir);

      expect(result).toEqual({
        import: './lib/esm/utils.mjs',
        require: './lib/cjs/utils.cjs',
        default: './lib/esm/utils.mjs',
      });
    });

    it('prioritizes original path when all exist', async () => {
      await mkdir(join(testDir, 'lib', 'cjs'), { recursive: true });
      await mkdir(join(testDir, 'lib', 'esm'), { recursive: true });
      await mkdir(join(testDir, 'lib'), { recursive: true });

      await writeFile(join(testDir, 'lib', 'cjs', 'utils.js'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib', 'esm', 'utils.js'), 'export {};');
      await writeFile(join(testDir, 'lib', 'utils.js'), 'export {};'); // Original path

      const pattern: BuildPattern = {
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'esm',
        },
      };

      const result = expandUsageWithPattern('./lib/utils.js', pattern, testDir);

      expect(result?.default).toBe('./lib/utils.js'); // Should prefer original
      expect(result?.import).toBe('./lib/esm/utils.js');
      expect(result?.require).toBe('./lib/cjs/utils.js');
    });
  });
});
