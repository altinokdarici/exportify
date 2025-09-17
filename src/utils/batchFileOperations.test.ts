import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  batchDiscoverFiles,
  batchCheckFileExistence,
  batchFindDeclarationFiles,
  batchValidateFileMappings,
  batchProcessFiles,
  createFileCache,
  getFileExistenceFromCache,
  DEFAULT_BATCH_CONFIG,
} from './batchFileOperations.js';
import { DEFAULT_CONFIGS } from './multiExtensionFileDiscovery.js';

describe('Batch file operations', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'batch-ops-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('batchDiscoverFiles', () => {
    it('discovers multiple files in batch', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'helper.ts'), 'export {};');

      const importPaths = ['utils', 'helper', 'nonexistent'];
      const result = await batchDiscoverFiles(importPaths, tempDir, DEFAULT_CONFIGS.module);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(3);

      const utilsResult = result.results.find((r) => r.input === 'utils');
      expect(utilsResult?.success).toBe(true);
      expect(utilsResult?.result).toMatchObject({ filePath: 'lib/utils.js' });

      const helperResult = result.results.find((r) => r.input === 'helper');
      expect(helperResult?.success).toBe(true);
      expect(helperResult?.result).toMatchObject({ filePath: 'lib/helper.ts' });

      const nonexistentResult = result.results.find((r) => r.input === 'nonexistent');
      expect(nonexistentResult?.success).toBe(false);
    });

    it('respects concurrency limits', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });

      // Create multiple files
      const importPaths = Array.from({ length: 20 }, (_, i) => `file${i}`);
      for (const path of importPaths) {
        await writeFile(join(tempDir, 'lib', `${path}.js`), 'export {};');
      }

      const startTime = Date.now();
      const result = await batchDiscoverFiles(importPaths, tempDir, DEFAULT_CONFIGS.module, {
        ...DEFAULT_BATCH_CONFIG,
        concurrency: 5,
      });
      const endTime = Date.now();

      expect(result.successCount).toBe(20);
      expect(result.stats.totalTime).toBeLessThan(endTime - startTime + 100); // Allow some tolerance
    });

    it('continues on errors when configured', async () => {
      const importPaths = ['valid', 'invalid'];

      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'valid.js'), 'export {};');
      // Don't create invalid.js

      const result = await batchDiscoverFiles(importPaths, tempDir, DEFAULT_CONFIGS.module, {
        ...DEFAULT_BATCH_CONFIG,
        continueOnError: true,
      });

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('batchCheckFileExistence', () => {
    it('checks existence of multiple files', async () => {
      const file1 = join(tempDir, 'exists1.txt');
      const file2 = join(tempDir, 'exists2.txt');
      const file3 = join(tempDir, 'nonexistent.txt');

      await writeFile(file1, 'content1');
      await writeFile(file2, 'content2');

      const result = await batchCheckFileExistence([file1, file2, file3]);

      expect(result.successCount).toBe(3); // All checks succeed
      expect(result.results).toHaveLength(3);

      const exists1 = result.results.find((r) => r.input === file1);
      expect(exists1?.result).toBe(true);

      const exists2 = result.results.find((r) => r.input === file2);
      expect(exists2?.result).toBe(true);

      const nonexistent = result.results.find((r) => r.input === file3);
      expect(nonexistent?.result).toBe(false);
    });

    it('handles empty input', async () => {
      const result = await batchCheckFileExistence([]);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('batchFindDeclarationFiles', () => {
    it('finds declaration files for multiple sources', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await mkdir(join(tempDir, 'src'), { recursive: true });

      await writeFile(join(tempDir, 'lib', 'utils.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'helper.d.ts'), 'export {};');
      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export {};');
      await writeFile(join(tempDir, 'src', 'helper.ts'), 'export {};');

      const sourceFiles = ['lib/utils.js', 'lib/helper.js', 'lib/nonexistent.js'];
      const result = await batchFindDeclarationFiles(sourceFiles, tempDir);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);

      const utilsResult = result.results.find((r) => r.input === 'lib/utils.js');
      expect(utilsResult?.success).toBe(true);
      expect(utilsResult?.result).toMatchObject({ declarationPath: 'lib/utils.d.ts' });

      const helperResult = result.results.find((r) => r.input === 'lib/helper.js');
      expect(helperResult?.success).toBe(true);
      expect(helperResult?.result).toMatchObject({ declarationPath: 'lib/helper.d.ts' });
    });
  });

  describe('batchValidateFileMappings', () => {
    it('validates source to output mappings', async () => {
      await mkdir(join(tempDir, 'src'), { recursive: true });
      await mkdir(join(tempDir, 'lib'), { recursive: true });

      await writeFile(join(tempDir, 'src', 'utils.ts'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'utils.js'), 'export {};');

      const mappings = [
        { source: 'src/utils.ts', output: 'lib/utils.js' },
        { source: 'src/missing.ts', output: 'lib/missing.js' },
      ];

      const result = await batchValidateFileMappings(mappings, tempDir);

      expect(result.successCount).toBe(2); // All validations succeed
      expect(result.results).toHaveLength(2);

      const validMapping = result.results[0];
      expect(validMapping.result?.sourceExists).toBe(true);
      expect(validMapping.result?.outputExists).toBe(true);

      const invalidMapping = result.results[1];
      expect(invalidMapping.result?.sourceExists).toBe(false);
      expect(invalidMapping.result?.outputExists).toBe(false);
    });
  });

  describe('batchProcessFiles', () => {
    it('processes files with custom operation', async () => {
      const inputs = ['file1', 'file2', 'file3'];

      // Custom operation that doubles the length of input
      const operation = async (input: string): Promise<number> => {
        return input.length * 2;
      };

      const result = await batchProcessFiles(inputs, operation);

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);

      expect(result.results[0].result).toBe(10); // 'file1'.length * 2
      expect(result.results[1].result).toBe(10); // 'file2'.length * 2
      expect(result.results[2].result).toBe(10); // 'file3'.length * 2
    });

    it('handles operation errors', async () => {
      const inputs = ['success', 'error'];

      const operation = async (input: string): Promise<string> => {
        if (input === 'error') {
          throw new Error('Test error');
        }
        return `processed-${input}`;
      };

      const result = await batchProcessFiles(inputs, operation);

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);

      const successResult = result.results.find((r) => r.input === 'success');
      expect(successResult?.success).toBe(true);
      expect(successResult?.result).toBe('processed-success');

      const errorResult = result.results.find((r) => r.input === 'error');
      expect(errorResult?.success).toBe(false);
      expect(errorResult?.error).toBe('Test error');
    });
  });

  describe('createFileCache', () => {
    it('creates cache of existing files', async () => {
      await mkdir(join(tempDir, 'lib', 'utils'), { recursive: true });
      await mkdir(join(tempDir, 'src'), { recursive: true });

      await writeFile(join(tempDir, 'lib', 'index.js'), 'export {};');
      await writeFile(join(tempDir, 'lib', 'utils', 'helper.js'), 'export {};');
      await writeFile(join(tempDir, 'src', 'main.ts'), 'export {};');

      const cache = await createFileCache(tempDir, ['lib', 'src']);

      expect(cache.get('lib/index.js')).toBe(true);
      expect(cache.get('lib/utils/helper.js')).toBe(true);
      expect(cache.get('src/main.ts')).toBe(true);
      expect(cache.get('nonexistent.js')).toBeUndefined();
    });

    it('handles non-existent directories', async () => {
      const cache = await createFileCache(tempDir, ['nonexistent']);
      expect(cache.size).toBe(0);
    });
  });

  describe('getFileExistenceFromCache', () => {
    it('returns cached values when available', async () => {
      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'cached.js'), 'export {};');

      const cache = await createFileCache(tempDir, ['lib']);

      const exists = getFileExistenceFromCache('lib/cached.js', cache, tempDir);
      expect(exists).toBe(true);

      const notExists = getFileExistenceFromCache('lib/notcached.js', cache, tempDir);
      expect(notExists).toBe(false);
    });

    it('falls back to direct check and updates cache', async () => {
      const cache = new Map<string, boolean>();

      await mkdir(join(tempDir, 'lib'), { recursive: true });
      await writeFile(join(tempDir, 'lib', 'new.js'), 'export {};');

      // File not in cache initially
      expect(cache.has('lib/new.js')).toBe(false);

      const exists = getFileExistenceFromCache('lib/new.js', cache, tempDir);
      expect(exists).toBe(true);

      // Should now be in cache
      expect(cache.get('lib/new.js')).toBe(true);
    });

    it('handles relative path normalization', async () => {
      const cache = new Map([['lib/module.js', true]]);

      const exists = getFileExistenceFromCache('./lib/module.js', cache, tempDir);
      expect(exists).toBe(true);
    });
  });
});
