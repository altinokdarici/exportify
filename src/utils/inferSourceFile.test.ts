import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { inferSourceFile, inferExportEntry } from './inferSourceFile.js';

describe('inferSourceFile', () => {
  const testDir = join(process.cwd(), 'test-temp-inference');

  beforeEach(() => {
    // Create test directory structure
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('existing target files', () => {
    it('returns targetExists: true when target file exists', () => {
      // Create lib/utils.js
      mkdirSync(join(testDir, 'lib'), { recursive: true });
      writeFileSync(join(testDir, 'lib', 'utils.js'), 'export const util = () => {};');

      const result = inferSourceFile('./lib/utils.js', testDir);

      expect(result.targetExists).toBe(true);
      expect(result.sourcePath).toBeUndefined();
    });
  });

  describe('source file inference for missing targets', () => {
    it('infers TypeScript source for missing JavaScript target', () => {
      // Create src/utils.ts but not lib/utils.js
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'utils.ts'), 'export const util = () => {};');

      const result = inferSourceFile('./lib/utils.js', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./src/utils.ts');
      expect(result.mapping).toEqual({
        sourceDir: 'src',
        outputDir: 'lib',
        preserveStructure: true,
      });
      expect(result.suggestedOutput).toBe('./lib/utils.js');
    });

    it('infers TypeScript source for missing d.ts target', () => {
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'types.ts'), 'export interface Config {}');

      const result = inferSourceFile('./lib/types.d.ts', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./src/types.ts');
    });

    it('infers JSX source for missing JavaScript target', () => {
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(
        join(testDir, 'src', 'component.tsx'),
        'export const Component = () => <div />;'
      );

      const result = inferSourceFile('./dist/component.js', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./src/component.tsx');
      expect(result.mapping).toEqual({
        sourceDir: 'src',
        outputDir: 'dist',
        preserveStructure: true,
      });
    });

    it('handles index files correctly', () => {
      mkdirSync(join(testDir, 'src', 'utils'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'utils', 'index.ts'), 'export * from "./helper";');

      const result = inferSourceFile('./lib/utils.js', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./src/utils/index.ts');
    });

    it('works with source directory instead of src', () => {
      mkdirSync(join(testDir, 'source'), { recursive: true });
      writeFileSync(join(testDir, 'source', 'helper.ts'), 'export const help = () => {};');

      const result = inferSourceFile('./lib/helper.js', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./source/helper.ts');
      expect(result.mapping).toEqual({
        sourceDir: 'source',
        outputDir: 'lib',
        preserveStructure: true,
      });
    });

    it('returns no source when no matching file found', () => {
      const result = inferSourceFile('./lib/nonexistent.js', testDir);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBeUndefined();
      expect(result.mapping).toBeUndefined();
    });
  });

  describe('custom mappings', () => {
    it('uses custom mappings before common ones', () => {
      // Create custom source structure
      mkdirSync(join(testDir, 'app'), { recursive: true });
      writeFileSync(join(testDir, 'app', 'main.ts'), 'export const main = () => {};');

      const customMappings = [{ sourceDir: 'app', outputDir: 'build', preserveStructure: true }];

      const result = inferSourceFile('./build/main.js', testDir, customMappings);

      expect(result.targetExists).toBe(false);
      expect(result.sourcePath).toBe('./app/main.ts');
      expect(result.mapping).toEqual(customMappings[0]);
    });
  });

  describe('extension mapping priority', () => {
    it('prefers TypeScript over JavaScript when both exist', () => {
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'config.ts'), 'export const config = {};');
      writeFileSync(join(testDir, 'src', 'config.js'), 'module.exports = {};');

      const result = inferSourceFile('./lib/config.js', testDir);

      expect(result.sourcePath).toBe('./src/config.ts');
    });

    it('falls back to other extensions when preferred not found', () => {
      mkdirSync(join(testDir, 'src'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'legacy.jsx'), 'export const Legacy = () => <div />;');

      const result = inferSourceFile('./dist/legacy.js', testDir);

      expect(result.sourcePath).toBe('./src/legacy.jsx');
    });
  });
});

describe('inferExportEntry', () => {
  const testDir = join(process.cwd(), 'test-temp-inference-export');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('generates complete export entry for TypeScript source', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'api.ts'), 'export interface API {}');

    const result = inferExportEntry('./api', testDir);

    expect(result).toEqual({
      source: './src/api.ts',
      types: './lib/api.d.ts',
      import: './lib/api.js',
      default: './lib/api.js',
    });
  });

  it('generates export entry for JavaScript source', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'util.js'), 'export const util = () => {};');

    const result = inferExportEntry('./util', testDir);

    expect(result).toEqual({
      source: './src/util.js',
      import: './lib/util.js',
      default: './lib/util.js',
    });
  });

  it('tries multiple output directories', () => {
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'component.tsx'), 'export const Component = () => <div />;');

    const result = inferExportEntry('./component', testDir);

    // Should find it regardless of which output directory is tried first
    expect(result).toBeTruthy();
    expect(result?.source).toBe('./src/component.tsx');
    expect(result?.types).toMatch(/\.\/\w+\/component\.d\.ts/);
    expect(result?.import).toMatch(/\.\/\w+\/component\.js/);
  });

  it('returns null when no source file found', () => {
    const result = inferExportEntry('./nonexistent', testDir);

    expect(result).toBeNull();
  });

  it('works with nested paths', () => {
    mkdirSync(join(testDir, 'src', 'utils'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'utils', 'helper.ts'), 'export const help = () => {};');

    const result = inferExportEntry('./utils/helper', testDir);

    expect(result).toEqual({
      source: './src/utils/helper.ts',
      types: './lib/utils/helper.d.ts',
      import: './lib/utils/helper.js',
      default: './lib/utils/helper.js',
    });
  });
});
