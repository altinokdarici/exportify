import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateBaselineExports } from './generateBaselineExports.js';

describe('generateBaselineExports', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `exportmapify-baseline-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('generates exports for main field only', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.js',
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/index.js',
        default: './lib/index.js',
      },
    });
  });

  it('generates exports for main + module fields', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.cjs'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib/index.mjs'), 'export {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.cjs',
      module: 'lib/index.mjs',
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        import: './lib/index.mjs',
        require: './lib/index.cjs',
        default: './lib/index.cjs',
      },
    });
  });

  it('handles ESM main field correctly', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(
      join(testDir, 'package.json'),
      JSON.stringify({
        name: 'test',
        type: 'module',
      })
    );
    await writeFile(join(testDir, 'lib/index.js'), 'export {};');

    const packageJson = {
      name: 'test',
      type: 'module',
      main: 'lib/index.js',
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        default: './lib/index.js',
      },
    });
  });

  it('handles string browser field', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.js',
      browser: 'lib/browser.js',
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/index.js',
        browser: './lib/browser.js',
        default: './lib/index.js',
      },
    });
  });

  it('handles object browser field with main replacement', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.js',
      browser: {
        './lib/index.js': './lib/browser.js',
      },
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/index.js',
        browser: './lib/browser.js',
        default: './lib/index.js',
      },
    });
  });

  it('handles object browser field with separate entries', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.js',
      browser: {
        './lib/utils.js': './lib/browser-utils.js',
      },
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/index.js',
        default: './lib/index.js',
      },
      './lib/utils.js': {
        browser: './lib/browser-utils.js',
        default: './lib/utils.js',
      },
    });
  });

  it('skips false browser field entries', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.js',
      browser: {
        './lib/node-only.js': false,
        './lib/utils.js': './lib/browser-utils.js',
      },
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': {
        types: './lib/index.d.ts',
        require: './lib/index.js',
        default: './lib/index.js',
      },
      './lib/utils.js': {
        browser: './lib/browser-utils.js',
        default: './lib/utils.js',
      },
    });
  });

  it('returns fallback when no fields are present', async () => {
    const packageJson = {
      name: 'test',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    expect(result).toEqual({
      '.': './lib/index.js',
    });
  });

  it('handles mixed conditions in correct order', async () => {
    await mkdir(join(testDir, 'lib'), { recursive: true });
    await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    await writeFile(join(testDir, 'lib/index.cjs'), 'module.exports = {};');
    await writeFile(join(testDir, 'lib/index.mjs'), 'export {};');

    const packageJson = {
      name: 'test',
      main: 'lib/index.cjs',
      module: 'lib/index.mjs',
      browser: 'lib/browser.js',
      types: 'lib/index.d.ts',
    };

    const result = await generateBaselineExports(packageJson, testDir);

    // Verify order: types, import, require, browser, default
    const rootExport = result['.'] as Record<string, string>;
    const keys = Object.keys(rootExport);
    expect(keys).toEqual(['types', 'import', 'require', 'browser', 'default']);

    expect(rootExport).toEqual({
      types: './lib/index.d.ts',
      import: './lib/index.mjs',
      require: './lib/index.cjs',
      browser: './lib/browser.js',
      default: './lib/index.cjs',
    });
  });

  describe('source condition support', () => {
    it('adds source condition from package.json source field', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await writeFile(join(testDir, 'src/index.ts'), 'export const test = 1;');

      const packageJson = {
        name: 'test',
        main: 'lib/index.js',
        source: 'src/index.ts',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          source: './src/index.ts',
          types: './lib/index.d.ts',
          require: './lib/index.js',
          default: './lib/index.js',
        },
      });
    });

    it('discovers source file from main field mapping', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'lib'), { recursive: true });
      await writeFile(join(testDir, 'src/index.ts'), 'export const test = 1;');
      await writeFile(join(testDir, 'lib/index.js'), 'module.exports = {};');

      const packageJson = {
        name: 'test',
        main: 'lib/index.js',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          source: './src/index.ts',
          types: './lib/index.d.ts',
          require: './lib/index.js',
          default: './lib/index.js',
        },
      });
    });

    it('discovers source file from module field mapping', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'lib'), { recursive: true });
      await writeFile(join(testDir, 'src/index.ts'), 'export const test = 1;');
      await writeFile(join(testDir, 'lib/index.mjs'), 'export {};');

      const packageJson = {
        name: 'test',
        module: 'lib/index.mjs',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          source: './src/index.ts',
          types: './lib/index.d.ts',
          import: './lib/index.mjs',
        },
      });
    });

    it('prefers package.json source field over discovered source', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'source'), { recursive: true });
      await writeFile(join(testDir, 'src/index.ts'), 'export const test = 1;');
      await writeFile(join(testDir, 'source/main.ts'), 'export const main = 1;');

      const packageJson = {
        name: 'test',
        main: 'lib/index.js',
        source: 'source/main.ts',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          source: './source/main.ts',
          types: './lib/index.d.ts',
          require: './lib/index.js',
          default: './lib/index.js',
        },
      });
    });

    it('adds source condition to browser field entries', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await writeFile(join(testDir, 'src/utils.ts'), 'export const utils = {};');

      const packageJson = {
        name: 'test',
        main: 'lib/index.js',
        browser: {
          './lib/utils.js': './lib/browser-utils.js',
        },
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          types: './lib/index.d.ts',
          require: './lib/index.js',
          default: './lib/index.js',
        },
        './lib/utils.js': {
          source: './src/utils.ts',
          browser: './lib/browser-utils.js',
          default: './lib/utils.js',
        },
      });
    });

    it('orders conditions correctly with source first', async () => {
      await mkdir(join(testDir, 'src'), { recursive: true });
      await mkdir(join(testDir, 'lib'), { recursive: true });
      await writeFile(join(testDir, 'src/index.ts'), 'export const test = 1;');
      await writeFile(join(testDir, 'lib/index.cjs'), 'module.exports = {};');
      await writeFile(join(testDir, 'lib/index.mjs'), 'export {};');

      const packageJson = {
        name: 'test',
        main: 'lib/index.cjs',
        module: 'lib/index.mjs',
        browser: 'lib/browser.js',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      const rootExport = result['.'] as Record<string, string>;
      const keys = Object.keys(rootExport);
      expect(keys).toEqual(['source', 'types', 'import', 'require', 'browser', 'default']);

      expect(rootExport).toEqual({
        source: './src/index.ts',
        types: './lib/index.d.ts',
        import: './lib/index.mjs',
        require: './lib/index.cjs',
        browser: './lib/browser.js',
        default: './lib/index.cjs',
      });
    });

    it('skips source condition when no source file found', async () => {
      const packageJson = {
        name: 'test',
        main: 'lib/index.js',
        types: 'lib/index.d.ts',
      };

      const result = await generateBaselineExports(packageJson, testDir);

      expect(result).toEqual({
        '.': {
          types: './lib/index.d.ts',
          require: './lib/index.js',
          default: './lib/index.js',
        },
      });
    });
  });
});
