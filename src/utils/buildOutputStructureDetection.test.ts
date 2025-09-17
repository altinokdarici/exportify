import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  detectBuildStructure,
  detectBuildDirectories,
  detectSourceDirectories,
  getRecommendedConfig,
} from './buildOutputStructureDetection.js';

describe('Build output structure detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'build-struct-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('detectBuildDirectories', () => {
    it('detects common build directories with compiled files', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'dist'), { recursive: true });
      await mkdir(join(tempDir, 'build'), { recursive: true });

      // Add compiled files
      await writeFile(join(tempDir, 'lib', 'index.js'), 'module.exports = {};');
      await writeFile(join(tempDir, 'dist', 'bundle.js'), 'export {};');
      await writeFile(join(tempDir, 'build', 'main.js'), 'console.log("hello");');

      const buildDirs = detectBuildDirectories(tempDir);

      expect(buildDirs).toContain('lib');
      expect(buildDirs).toContain('dist');
      expect(buildDirs).toContain('build');
    });

    it('ignores directories without compiled files', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'empty'), { recursive: true });

      // Only add compiled files to lib
      await writeFile(join(tempDir, 'lib', 'index.js'), 'module.exports = {};');
      // empty directory has no files

      const buildDirs = detectBuildDirectories(tempDir);

      expect(buildDirs).toContain('lib');
      expect(buildDirs).not.toContain('empty');
    });

    it('detects TypeScript declaration files', async () => {
      await mkdir(join(tempDir, 'types'), { recursive: true });
      await writeFile(join(tempDir, 'types', 'index.d.ts'), 'export {};');

      const buildDirs = detectBuildDirectories(tempDir);

      expect(buildDirs).toContain('types');
    });
  });

  describe('detectSourceDirectories', () => {
    it('detects common source directories', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await mkdir(join(tempDir, 'source'), { recursive: true });

      await writeFile(join(tempDir, 'src', 'index.ts'), 'export {};');
      await writeFile(join(tempDir, 'source', 'main.js'), 'console.log("hello");');

      const sourceDirs = detectSourceDirectories(tempDir);

      expect(sourceDirs).toContain('src');
      expect(sourceDirs).toContain('source');
    });

    it('ignores directories without source files', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await mkdir(join(tempDir, 'docs'), { recursive: true });

      await writeFile(join(tempDir, 'src', 'index.ts'), 'export {};');
      await writeFile(join(tempDir, 'docs', 'readme.md'), '# Documentation');

      const sourceDirs = detectSourceDirectories(tempDir);

      expect(sourceDirs).toContain('src');
      expect(sourceDirs).not.toContain('docs');
    });
  });

  describe('detectBuildStructure', () => {
    it('detects complete build structure', async () => {
      // Create directory structure
      await mkdir(join(tempDir, 'src', 'components'), { recursive: true });
      await mkdir(join(tempDir, 'lib', 'components'), { recursive: true });
      await mkdir(join(tempDir, 'types'), { recursive: true });

      // Create source files
      await writeFile(join(tempDir, 'src', 'index.ts'), 'export {};');
      await writeFile(join(tempDir, 'src', 'components', 'Button.tsx'), 'export {};');

      // Create build files
      await writeFile(join(tempDir, 'lib', 'index.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'components', 'Button.js'), 'export {};');
      await writeFile(join(tempDir, 'types', 'index.d.ts'), 'export {};');

      // Create package.json
      const packageJson = {
        name: 'test-package',
        main: 'lib/index.js',
        types: 'types/index.d.ts',
        scripts: { build: 'tsc' },
      };
      await writeFile(join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          outDir: 'lib',
          declarationDir: 'types',
        },
      };
      await writeFile(join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const structure = detectBuildStructure(tempDir);

      expect(structure.buildDirs).toContain('lib');
      expect(structure.buildDirs).toContain('types');
      expect(structure.sourceDirs).toContain('src');
      expect(structure.typescript.hasDeclarations).toBe(true);
      expect(structure.typescript.declarationDir).toBe('types');
      expect(structure.typescript.outDir).toBe('lib');
      expect(structure.packageFields.main).toBe('lib/index.js');
      expect(structure.packageFields.types).toBe('types/index.d.ts');
      expect(structure.preservesStructure).toBe(true);
    });

    it('handles minimal structure', async () => {
      // Just create a simple lib directory
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'index.js'), 'module.exports = {};');

      const structure = detectBuildStructure(tempDir);

      expect(structure.buildDirs).toEqual(['lib']);
      expect(structure.sourceDirs).toEqual([]);
      expect(structure.typescript.hasDeclarations).toBe(false);
      expect(structure.preservesStructure).toBe(false);
    });
  });

  describe('getRecommendedConfig', () => {
    it('returns recommended configuration based on structure', async () => {
      // Create a typical TypeScript project structure
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await mkdir(join(tempDir, 'lib'), { recursive: true });

      await writeFile(join(tempDir, 'src', 'index.ts'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'index.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'index.d.ts'), 'export {};');

      const structure = detectBuildStructure(tempDir);
      const config = getRecommendedConfig(structure);

      expect(config.outputDir).toBe('lib');
      expect(config.sourceDir).toBe('src');
      expect(config.preserveStructure).toBe(true);
      expect(config.generateDeclarations).toBe(true);
    });

    it('provides defaults for minimal structure', () => {
      const structure = detectBuildStructure(tempDir);
      const config = getRecommendedConfig(structure);

      expect(config.outputDir).toBe('lib');
      expect(config.sourceDir).toBe('src');
      expect(config.preserveStructure).toBe(false);
      expect(config.generateDeclarations).toBe(false);
    });
  });
});
