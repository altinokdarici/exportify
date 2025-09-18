import { describe, it, expect } from '@jest/globals';
import { detectBuildPattern } from './detectBuildPattern.js';

describe('detectBuildPattern', () => {
  describe('no delta cases', () => {
    it('returns no pattern when main field is missing', () => {
      const result = detectBuildPattern(undefined, './lib/esm/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });

    it('returns no pattern when module field is missing', () => {
      const result = detectBuildPattern('./lib/cjs/index.js', undefined);
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });

    it('returns no pattern when paths are identical', () => {
      const result = detectBuildPattern('./lib/index.js', './lib/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });

    it('returns no pattern for unrelated paths', () => {
      const result = detectBuildPattern('./src/main.js', './dist/bundle.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });
  });

  describe('directory pattern detection', () => {
    it('detects cjs/esm directory pattern', () => {
      const result = detectBuildPattern('./lib/cjs/index.js', './lib/esm/index.js');
      expect(result).toEqual({
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
      });
    });

    it('detects commonjs/module directory pattern', () => {
      const result = detectBuildPattern('./dist/commonjs/index.js', './dist/module/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './dist',
          identifier: 'commonjs',
        },
        esmPattern: {
          basePath: './dist',
          identifier: 'module',
        },
      });
    });

    it('detects pattern with reversed order (module as main)', () => {
      const result = detectBuildPattern('./lib/esm/index.js', './lib/cjs/index.js');
      expect(result).toEqual({
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
      });
    });

    it('handles nested directory patterns', () => {
      const result = detectBuildPattern('./build/lib/cjs/index.js', './build/lib/esm/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './build/lib',
          identifier: 'cjs',
        },
        esmPattern: {
          basePath: './build/lib',
          identifier: 'esm',
        },
      });
    });

    it('rejects patterns with different filenames', () => {
      const result = detectBuildPattern('./lib/cjs/index.js', './lib/esm/main.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });

    it('rejects patterns with multiple directory differences', () => {
      const result = detectBuildPattern('./lib/cjs/v1/index.js', './dist/esm/v2/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });
  });

  describe('extension pattern detection', () => {
    it('detects .cjs/.mjs extension pattern', () => {
      const result = detectBuildPattern('./lib/index.cjs', './lib/index.mjs');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'extension',
        cjsPattern: {
          basePath: './lib/index',
          identifier: '.cjs',
        },
        esmPattern: {
          basePath: './lib/index',
          identifier: '.mjs',
        },
      });
    });

    it('detects pattern with reversed order', () => {
      const result = detectBuildPattern('./lib/index.mjs', './lib/index.cjs');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'extension',
        cjsPattern: {
          basePath: './lib/index',
          identifier: '.cjs',
        },
        esmPattern: {
          basePath: './lib/index',
          identifier: '.mjs',
        },
      });
    });

    it('rejects different base paths', () => {
      const result = detectBuildPattern('./lib/main.cjs', './lib/index.mjs');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });
  });

  describe('prefix pattern detection', () => {
    it('detects cjs.prefix pattern', () => {
      const result = detectBuildPattern('./lib/cjs.index.js', './lib/esm.index.js');
      expect(result).toEqual({
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
      });
    });

    it('detects dash-separated prefix pattern', () => {
      const result = detectBuildPattern('./lib/cjs-bundle.js', './lib/esm-bundle.js');
      expect(result).toEqual({
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
      });
    });

    it('detects commonjs/module prefix pattern', () => {
      const result = detectBuildPattern('./dist/commonjs.main.js', './dist/module.main.js');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'prefix',
        cjsPattern: {
          basePath: './dist',
          identifier: 'commonjs',
        },
        esmPattern: {
          basePath: './dist',
          identifier: 'module',
        },
      });
    });

    it('rejects patterns with different directory paths', () => {
      const result = detectBuildPattern('./lib/cjs.index.js', './dist/esm.index.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });

    it('rejects patterns with different suffixes', () => {
      const result = detectBuildPattern('./lib/cjs.index.js', './lib/esm.main.js');
      expect(result).toEqual({
        hasMultipleBuilds: false,
        patternType: 'none',
      });
    });
  });

  describe('complex real-world patterns', () => {
    it('prioritizes directory pattern over extension pattern', () => {
      // This tests that directory detection runs first and succeeds
      const result = detectBuildPattern('./lib/cjs/index.cjs', './lib/esm/index.mjs');
      expect(result.patternType).toBe('directory');
      expect(result.cjsPattern?.identifier).toBe('cjs');
      expect(result.esmPattern?.identifier).toBe('esm');
    });

    it('handles normalized paths correctly', () => {
      const result = detectBuildPattern('lib/cjs/index.js', 'lib/esm/index.js');
      expect(result).toEqual({
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
      });
    });

    it('handles case insensitive identifiers', () => {
      const result = detectBuildPattern('./lib/CJS/index.js', './lib/ESM/index.js');
      expect(result).toEqual({
        hasMultipleBuilds: true,
        patternType: 'directory',
        cjsPattern: {
          basePath: './lib',
          identifier: 'CJS',
        },
        esmPattern: {
          basePath: './lib',
          identifier: 'ESM',
        },
      });
    });
  });
});
