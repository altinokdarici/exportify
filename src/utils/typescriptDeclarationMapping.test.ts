import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  findDeclarationFile,
  generateExpectedDeclarationPath,
  mapSourceToDeclaration,
  findAllDeclarationFiles,
  validateDeclarationMapping,
} from './typescriptDeclarationMapping.js';

describe('TypeScript declaration mapping', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ts-decl-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('findDeclarationFile', () => {
    it('finds exact declaration file in same directory', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'module.exports = {};');
      await writeFile(join(tempDir, 'lib', 'utils.d.ts'), 'export {};');

      const result = findDeclarationFile('lib/utils.js', tempDir);

      expect(result).toEqual({
        declarationPath: 'lib/utils.d.ts',
        sourcePath: 'lib/utils.js',
        mappingType: 'exact',
        exists: true,
      });
    });

    it('handles declaration files directly', async () => {
      await mkdir(join(tempDir, 'types'), { recursive: true });
      await writeFile(join(tempDir, 'types', 'index.d.ts'), 'export {};');

      const result = findDeclarationFile('types/index.d.ts', tempDir);

      expect(result).toEqual({
        declarationPath: 'types/index.d.ts',
        mappingType: 'exact',
        exists: true,
      });
    });

    it('finds declaration file in different build directory', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'dist'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'component.js'), 'export {};');
      await writeFile(join(tempDir, 'dist', 'component.d.ts'), 'export {};');

      const result = findDeclarationFile('lib/component.js', tempDir, ['lib', 'dist']);

      expect(result).toEqual({
        declarationPath: 'dist/component.d.ts',
        sourcePath: 'lib/component.js',
        mappingType: 'inferred',
        exists: true,
      });
    });

    it('returns none when no declaration file found', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'module.exports = {};');

      const result = findDeclarationFile('lib/utils.js', tempDir);

      expect(result.mappingType).toBe('none');
      expect(result.exists).toBe(false);
    });
  });

  describe('generateExpectedDeclarationPath', () => {
    it('generates path for source file', () => {
      const result = generateExpectedDeclarationPath('src/utils/helper.ts');
      expect(result).toBe('lib/utils/helper.d.ts');
    });

    it('preserves directory structure', () => {
      const result = generateExpectedDeclarationPath('src/components/Button.tsx', ['dist']);
      expect(result).toBe('dist/components/Button.d.ts');
    });

    it('handles files already in build directory', () => {
      const result = generateExpectedDeclarationPath('lib/utils.js');
      expect(result).toBe('lib/utils.d.ts');
    });

    it('uses default lib directory for unknown structure', () => {
      const result = generateExpectedDeclarationPath('unknown/path.ts');
      expect(result).toBe('lib/unknown/path.d.ts');
    });
  });

  describe('mapSourceToDeclaration', () => {
    it('maps TypeScript source to declaration', () => {
      const result = mapSourceToDeclaration('src/components/Button.tsx');
      expect(result).toBe('lib/components/Button.d.ts');
    });

    it('removes source directory prefix', () => {
      const result = mapSourceToDeclaration('source/utils/helper.ts', 'dist');
      expect(result).toBe('dist/utils/helper.d.ts');
    });

    it('handles relative paths', () => {
      const result = mapSourceToDeclaration('./src/index.ts', 'build');
      expect(result).toBe('build/index.d.ts');
    });
  });

  describe('findAllDeclarationFiles', () => {
    it('finds all declaration files in build directories', async () => {
      await mkdir(join(tempDir, 'lib', 'utils'), { recursive: true });
      await mkdir(join(tempDir, 'dist', 'components'), { recursive: true });

      await writeFile(join(tempDir, 'lib', 'index.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'utils', 'helper.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'dist', 'components', 'Button.d.ts'), 'export {};');

      const results = findAllDeclarationFiles(tempDir, ['lib', 'dist']);

      expect(results).toHaveLength(3);
      expect(results).toContain('lib/index.d.ts');
      expect(results).toContain('lib/utils/helper.d.ts');
      expect(results).toContain('dist/components/Button.d.ts');
    });

    it('returns empty array when no build directories exist', async () => {
      const results = findAllDeclarationFiles(tempDir, ['nonexistent']);
      expect(results).toEqual([]);
    });
  });

  describe('validateDeclarationMapping', () => {
    it('validates correct mapping', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'src'), { recursive: true });

      await writeFile(join(tempDir, 'lib', 'utils.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export {};');

      const isValid = validateDeclarationMapping('lib/utils.d.ts', 'src/utils.ts', tempDir);

      expect(isValid).toBe(true);
    });

    it('rejects mapping with mismatched names', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'src'), { recursive: true });

      await writeFile(join(tempDir, 'lib', 'utils.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'src', 'helper.ts'), 'export {};');

      const isValid = validateDeclarationMapping('lib/utils.d.ts', 'src/helper.ts', tempDir);

      expect(isValid).toBe(false);
    });

    it('rejects mapping when files do not exist', async () => {
      const isValid = validateDeclarationMapping(
        'lib/nonexistent.d.ts',
        'src/nonexistent.ts',
        tempDir
      );

      expect(isValid).toBe(false);
    });
  });
});
