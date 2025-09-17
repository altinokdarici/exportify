import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  fileExists,
  directoryExists,
  findExistingFile,
  fileExistsSync,
  findExistingFileSync,
  batchFileExists,
  findFilesWithExtensions,
  findIndexFile,
} from './fileExists.js';

describe('fileExists utilities', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'file-exists-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('fileExists', () => {
    it('returns true for existing files', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      expect(await fileExists(filePath)).toBe(true);
    });

    it('returns false for non-existent files', async () => {
      const filePath = join(tempDir, 'nonexistent.txt');
      expect(await fileExists(filePath)).toBe(false);
    });

    it('returns false for directories', async () => {
      const dirPath = join(tempDir, 'testdir');
      await mkdir(dirPath);

      expect(await fileExists(dirPath)).toBe(false);
    });
  });

  describe('directoryExists', () => {
    it('returns true for existing directories', async () => {
      const dirPath = join(tempDir, 'testdir');
      await mkdir(dirPath);

      expect(await directoryExists(dirPath)).toBe(true);
    });

    it('returns false for non-existent directories', async () => {
      const dirPath = join(tempDir, 'nonexistent');
      expect(await directoryExists(dirPath)).toBe(false);
    });

    it('returns false for files', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      expect(await directoryExists(filePath)).toBe(false);
    });
  });

  describe('findExistingFile', () => {
    it('finds file with first matching extension', async () => {
      const basePath = join(tempDir, 'test');
      await writeFile(`${basePath}.js`, 'content');

      const result = await findExistingFile(basePath, ['.ts', '.js', '.jsx']);
      expect(result).toBe(`${basePath}.js`);
    });

    it('returns null when no files exist', async () => {
      const basePath = join(tempDir, 'nonexistent');
      const result = await findExistingFile(basePath, ['.ts', '.js', '.jsx']);
      expect(result).toBeNull();
    });

    it('respects extension priority order', async () => {
      const basePath = join(tempDir, 'test');
      await writeFile(`${basePath}.js`, 'js content');
      await writeFile(`${basePath}.ts`, 'ts content');

      const result = await findExistingFile(basePath, ['.ts', '.js']);
      expect(result).toBe(`${basePath}.ts`);
    });
  });

  describe('fileExistsSync', () => {
    it('returns detailed info for existing files', async () => {
      const filePath = join(tempDir, 'test.txt');
      await writeFile(filePath, 'content');

      const result = fileExistsSync(filePath);
      expect(result).toEqual({
        exists: true,
        path: filePath,
        type: 'file',
      });
    });

    it('returns detailed info for directories', async () => {
      const dirPath = join(tempDir, 'testdir');
      await mkdir(dirPath);

      const result = fileExistsSync(dirPath);
      expect(result).toEqual({
        exists: true,
        path: dirPath,
        type: 'directory',
      });
    });

    it('returns exists false for non-existent paths', () => {
      const result = fileExistsSync(join(tempDir, 'nonexistent'));
      expect(result).toEqual({ exists: false });
    });
  });

  describe('findExistingFileSync', () => {
    it('finds file with matching extension synchronously', async () => {
      const basePath = join(tempDir, 'test');
      await writeFile(`${basePath}.tsx`, 'content');

      const result = findExistingFileSync(basePath, ['.ts', '.tsx', '.js']);
      expect(result).toBe(`${basePath}.tsx`);
    });

    it('returns null when no files exist', () => {
      const basePath = join(tempDir, 'nonexistent');
      const result = findExistingFileSync(basePath, ['.ts', '.js']);
      expect(result).toBeNull();
    });
  });

  describe('batchFileExists', () => {
    it('checks existence of multiple files', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      const file3 = join(tempDir, 'nonexistent.txt');

      await writeFile(file1, 'content1');
      await writeFile(file2, 'content2');

      const results = await batchFileExists([file1, file2, file3]);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ exists: true, path: file1, type: 'file' });
      expect(results[1]).toEqual({ exists: true, path: file2, type: 'file' });
      expect(results[2]).toEqual({ exists: false });
    });
  });

  describe('findFilesWithExtensions', () => {
    it('finds multiple files with different extensions', async () => {
      const testDir = join(tempDir, 'testfiles');
      await mkdir(testDir);

      await writeFile(join(testDir, 'component.js'), 'js content');
      await writeFile(join(testDir, 'component.ts'), 'ts content');
      await writeFile(join(testDir, 'component.d.ts'), 'types content');

      const results = findFilesWithExtensions(testDir, 'component', ['.js', '.ts', '.d.ts']);

      expect(results).toHaveLength(3);
      expect(results).toContain(join(testDir, 'component.js'));
      expect(results).toContain(join(testDir, 'component.ts'));
      expect(results).toContain(join(testDir, 'component.d.ts'));
    });

    it('returns empty array when no files found', () => {
      const testDir = join(tempDir, 'empty');
      const results = findFilesWithExtensions(testDir, 'nonexistent', ['.js', '.ts']);
      expect(results).toEqual([]);
    });
  });

  describe('findIndexFile', () => {
    it('finds index file in directory', async () => {
      const testDir = join(tempDir, 'testdir');
      await mkdir(testDir);
      await writeFile(join(testDir, 'index.ts'), 'export * from "./module";');

      const result = findIndexFile(testDir, ['.js', '.ts', '.jsx']);
      expect(result).toBe(join(testDir, 'index.ts'));
    });

    it('respects extension priority', async () => {
      const testDir = join(tempDir, 'testdir');
      await mkdir(testDir);
      await writeFile(join(testDir, 'index.js'), 'js content');
      await writeFile(join(testDir, 'index.ts'), 'ts content');

      const result = findIndexFile(testDir, ['.ts', '.js']);
      expect(result).toBe(join(testDir, 'index.ts'));
    });

    it('returns null for non-existent directory', () => {
      const result = findIndexFile(join(tempDir, 'nonexistent'), ['.js', '.ts']);
      expect(result).toBeNull();
    });

    it('returns null when no index file exists', async () => {
      const testDir = join(tempDir, 'noindex');
      await mkdir(testDir);
      await writeFile(join(testDir, 'other.js'), 'content');

      const result = findIndexFile(testDir, ['.js', '.ts']);
      expect(result).toBeNull();
    });
  });
});
