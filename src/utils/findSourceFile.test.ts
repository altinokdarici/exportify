import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { findSourceFile, findSourceFromPackageJson } from './findSourceFile.js';

describe('findSourceFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'findSourceFile-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('source mappings', () => {
    test('finds TypeScript source for lib compiled file', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export const test = 1;');

      const result = findSourceFile('./lib/utils.js', tempDir);
      expect(result).toBe('./src/utils.ts');
    });

    test('finds TypeScript source for dist compiled file', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'helper.ts'), 'export const test = 1;');

      const result = findSourceFile('./dist/helper.js', tempDir);
      expect(result).toBe('./src/helper.ts');
    });

    test('finds source for build directory mapping to source', async () => {
      await mkdir(join(tempDir, 'source'), { recursive: true });
      await writeFile(
        join(tempDir, 'source', 'component.tsx'),
        'export const Component = () => {};'
      );

      const result = findSourceFile('./build/component.js', tempDir);
      expect(result).toBe('./source/component.tsx');
    });

    test('finds source for out directory', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'module.ts'), 'export const module = {};');

      const result = findSourceFile('./out/module.js', tempDir);
      expect(result).toBe('./src/module.ts');
    });
  });

  describe('direct source directory mapping', () => {
    test('finds TypeScript file in src directory', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'index.ts'), 'export * from "./utils";');

      const result = findSourceFile('./lib/index.js', tempDir);
      expect(result).toBe('./src/index.ts');
    });

    test('finds JSX file in source directory', async () => {
      await mkdir(join(tempDir, 'source'), { recursive: true });
      await writeFile(
        join(tempDir, 'source', 'component.jsx'),
        'export const Component = () => {};'
      );

      const result = findSourceFile('./dist/component.js', tempDir);
      expect(result).toBe('./source/component.jsx');
    });

    test('prefers TypeScript over JavaScript', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export const test = 1;');
      await writeFile(join(tempDir, 'src', 'utils.js'), 'export const test = 1;');

      const result = findSourceFile('./lib/utils.js', tempDir);
      expect(result).toBe('./src/utils.ts');
    });
  });

  describe('index file handling', () => {
    test('finds index.ts for directory import', async () => {
      await mkdir(join(tempDir, 'src', 'components'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'components', 'index.ts'), 'export * from "./Button";');

      const result = findSourceFile('./lib/components/index.js', tempDir);
      expect(result).toBe('./src/components/index.ts');
    });

    test('maps directory import to index file', async () => {
      await mkdir(join(tempDir, 'src', 'utils'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'utils', 'index.tsx'), 'export const utils = {};');

      const result = findSourceFile('./lib/utils', tempDir);
      expect(result).toBe('./src/utils/index.tsx');
    });
  });

  describe('file extensions', () => {
    test('handles TypeScript extension', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'types.ts'), 'export interface User {}');

      const result = findSourceFile('./lib/types.d.ts', tempDir);
      expect(result).toBe('./src/types.ts');
    });

    test('handles TSX extension', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'App.tsx'), 'export const App = () => <div />;');

      const result = findSourceFile('./lib/App.js', tempDir);
      expect(result).toBe('./src/App.tsx');
    });

    test('handles JSX extension', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'Component.jsx'), 'export const Component = () => {};');

      const result = findSourceFile('./lib/Component.js', tempDir);
      expect(result).toBe('./src/Component.jsx');
    });
  });

  describe('edge cases', () => {
    test('returns null when no source file exists', async () => {
      const result = findSourceFile('./lib/nonexistent.js', tempDir);
      expect(result).toBeNull();
    });

    test('handles path without leading "./"', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export const test = 1;');

      const result = findSourceFile('lib/utils.js', tempDir);
      expect(result).toBe('./src/utils.ts');
    });

    test('handles nested directory structures', async () => {
      await mkdir(join(tempDir, 'src', 'deep', 'nested'), { recursive: true });
      await writeFile(
        join(tempDir, 'src', 'deep', 'nested', 'module.ts'),
        'export const test = 1;'
      );

      const result = findSourceFile('./lib/deep/nested/module.js', tempDir);
      expect(result).toBe('./src/deep/nested/module.ts');
    });
  });
});

describe('findSourceFromPackageJson', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'findSourceFromPackageJson-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('finds source file from package.json source field', async () => {
    await mkdir(join(tempDir, 'src'), { recursive: true });
    await writeFile(join(tempDir, 'src', 'index.ts'), 'export const test = 1;');

    const packageJson = { source: 'src/index.ts' };
    const result = findSourceFromPackageJson(packageJson, tempDir);
    expect(result).toBe('./src/index.ts');
  });

  test('returns null when source field is missing', async () => {
    const packageJson = {};
    const result = findSourceFromPackageJson(packageJson, tempDir);
    expect(result).toBeNull();
  });

  test('returns null when source field is not a string', async () => {
    const packageJson = { source: 123 };
    const result = findSourceFromPackageJson(packageJson, tempDir);
    expect(result).toBeNull();
  });

  test('returns null when source file does not exist', async () => {
    const packageJson = { source: 'src/nonexistent.ts' };
    const result = findSourceFromPackageJson(packageJson, tempDir);
    expect(result).toBeNull();
  });
});
