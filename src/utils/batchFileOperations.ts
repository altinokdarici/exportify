import { join, relative } from 'path';
import { readdirSync, statSync } from 'fs';
import { fileExistsSync, batchFileExists } from './fileExists.js';
import {
  discoverFiles,
  DEFAULT_CONFIGS,
  type FileDiscoveryConfig,
} from './multiExtensionFileDiscovery.js';
import { findDeclarationFile } from './typescriptDeclarationMapping.js';

/**
 * Result of batch file operation
 */
export interface BatchOperationResult<T = unknown> {
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  failureCount: number;
  /** Results for each input */
  results: Array<{
    input: string;
    success: boolean;
    result?: T;
    error?: string;
  }>;
  /** Overall operation statistics */
  stats: {
    totalTime: number;
    averageTime: number;
    errors: string[];
  };
}

/**
 * Configuration for batch operations
 */
export interface BatchConfig {
  /** Maximum number of concurrent operations */
  concurrency: number;
  /** Whether to continue on errors */
  continueOnError: boolean;
  /** Timeout for individual operations in ms */
  operationTimeout: number;
  /** Whether to collect detailed statistics */
  collectStats: boolean;
}

/**
 * Default batch configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  concurrency: 10,
  continueOnError: true,
  operationTimeout: 5000,
  collectStats: true,
};

/**
 * Batch discovers files for multiple import paths
 * @param importPaths - Array of import paths to discover
 * @param packageDir - Package directory
 * @param config - Discovery configuration
 * @param batchConfig - Batch operation configuration
 * @returns Batch operation result with discovery results
 */
export async function batchDiscoverFiles(
  importPaths: string[],
  packageDir: string,
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module,
  batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchOperationResult> {
  const startTime = Date.now();
  const results: BatchOperationResult['results'] = [];
  const errors: string[] = [];

  // Process in chunks to respect concurrency limits
  const chunks = chunkArray(importPaths, batchConfig.concurrency);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (importPath) => {
      const operationStart = Date.now();

      try {
        const result = discoverFiles(importPath, packageDir, config);
        const operationTime = Date.now() - operationStart;

        if (operationTime > batchConfig.operationTimeout) {
          throw new Error(`Operation timeout after ${operationTime}ms`);
        }

        return {
          input: importPath,
          success: result.filePath !== undefined,
          result,
          operationTime,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${importPath}: ${errorMsg}`);

        if (!batchConfig.continueOnError) {
          throw error;
        }

        return {
          input: importPath,
          success: false,
          error: errorMsg,
          operationTime: Date.now() - operationStart,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    successCount,
    failureCount,
    results,
    stats: {
      totalTime,
      averageTime: totalTime / results.length,
      errors,
    },
  };
}

/**
 * Batch checks existence of multiple files
 * @param filePaths - Array of file paths to check
 * @param batchConfig - Batch operation configuration
 * @returns Batch operation result with existence results
 */
export async function batchCheckFileExistence(
  filePaths: string[]
): Promise<BatchOperationResult<boolean>> {
  const startTime = Date.now();
  const results: BatchOperationResult<boolean>['results'] = [];
  const errors: string[] = [];

  try {
    const existenceResults = await batchFileExists(filePaths);

    existenceResults.forEach((result, index) => {
      results.push({
        input: filePaths[index],
        success: true,
        result: result.exists,
      });
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);

    // Fallback to individual checks
    for (const filePath of filePaths) {
      try {
        const exists = fileExistsSync(filePath).exists;
        results.push({
          input: filePath,
          success: true,
          result: exists,
        });
      } catch (fileError) {
        const fileErrorMsg = fileError instanceof Error ? fileError.message : String(fileError);
        results.push({
          input: filePath,
          success: false,
          error: fileErrorMsg,
        });
        errors.push(`${filePath}: ${fileErrorMsg}`);
      }
    }
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  return {
    successCount,
    failureCount: results.length - successCount,
    results,
    stats: {
      totalTime,
      averageTime: totalTime / results.length,
      errors,
    },
  };
}

/**
 * Batch finds declaration files for multiple source files
 * @param sourceFiles - Array of source file paths
 * @param packageDir - Package directory
 * @param buildDirs - Build directories to search
 * @param batchConfig - Batch operation configuration
 * @returns Batch operation result with declaration results
 */
export async function batchFindDeclarationFiles(
  sourceFiles: string[],
  packageDir: string,
  buildDirs: string[] = ['lib', 'dist', 'build', 'out'],
  batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchOperationResult> {
  const startTime = Date.now();
  const results: BatchOperationResult['results'] = [];
  const errors: string[] = [];

  const chunks = chunkArray(sourceFiles, batchConfig.concurrency);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (sourceFile) => {
      const operationStart = Date.now();

      try {
        const result = findDeclarationFile(sourceFile, packageDir, buildDirs);
        const operationTime = Date.now() - operationStart;

        if (operationTime > batchConfig.operationTimeout) {
          throw new Error(`Operation timeout after ${operationTime}ms`);
        }

        return {
          input: sourceFile,
          success: result.exists,
          result,
          operationTime,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${sourceFile}: ${errorMsg}`);

        return {
          input: sourceFile,
          success: false,
          error: errorMsg,
          operationTime: Date.now() - operationStart,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  return {
    successCount,
    failureCount: results.length - successCount,
    results,
    stats: {
      totalTime,
      averageTime: totalTime / results.length,
      errors,
    },
  };
}

/**
 * Batch validates file mappings (source to output)
 * @param mappings - Array of source-to-output file mappings
 * @param packageDir - Package directory
 * @param batchConfig - Batch operation configuration
 * @returns Batch operation result with validation results
 */
export async function batchValidateFileMappings(
  mappings: Array<{ source: string; output: string }>,
  packageDir: string,
  batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchOperationResult<{ sourceExists: boolean; outputExists: boolean }>> {
  const startTime = Date.now();
  const results: BatchOperationResult<{ sourceExists: boolean; outputExists: boolean }>['results'] =
    [];
  const errors: string[] = [];

  const chunks = chunkArray(mappings, batchConfig.concurrency);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (mapping) => {
      const operationStart = Date.now();

      try {
        const sourcePath = join(packageDir, mapping.source);
        const outputPath = join(packageDir, mapping.output);

        const [sourceResult, outputResult] = await Promise.all([
          Promise.resolve(fileExistsSync(sourcePath)),
          Promise.resolve(fileExistsSync(outputPath)),
        ]);

        const operationTime = Date.now() - operationStart;

        if (operationTime > batchConfig.operationTimeout) {
          throw new Error(`Operation timeout after ${operationTime}ms`);
        }

        return {
          input: `${mapping.source} -> ${mapping.output}`,
          success: true,
          result: {
            sourceExists: sourceResult.exists,
            outputExists: outputResult.exists,
          },
          operationTime,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${mapping.source} -> ${mapping.output}: ${errorMsg}`);

        return {
          input: `${mapping.source} -> ${mapping.output}`,
          success: false,
          error: errorMsg,
          operationTime: Date.now() - operationStart,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  return {
    successCount,
    failureCount: results.length - successCount,
    results,
    stats: {
      totalTime,
      averageTime: totalTime / results.length,
      errors,
    },
  };
}

/**
 * Processes files in parallel with a custom operation function
 * @param inputs - Array of input values
 * @param operation - Function to perform on each input
 * @param batchConfig - Batch operation configuration
 * @returns Batch operation result
 */
export async function batchProcessFiles<T, R>(
  inputs: T[],
  operation: (input: T) => Promise<R>,
  batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchOperationResult<R>> {
  const startTime = Date.now();
  const results: BatchOperationResult<R>['results'] = [];
  const errors: string[] = [];

  const chunks = chunkArray(inputs, batchConfig.concurrency);

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (input) => {
      const operationStart = Date.now();

      try {
        const result = await operation(input);
        const operationTime = Date.now() - operationStart;

        if (operationTime > batchConfig.operationTimeout) {
          throw new Error(`Operation timeout after ${operationTime}ms`);
        }

        return {
          input: String(input),
          success: true,
          result,
          operationTime,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${String(input)}: ${errorMsg}`);

        if (!batchConfig.continueOnError) {
          throw error;
        }

        return {
          input: String(input),
          success: false,
          error: errorMsg,
          operationTime: Date.now() - operationStart,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  const totalTime = Date.now() - startTime;
  const successCount = results.filter((r) => r.success).length;

  return {
    successCount,
    failureCount: results.length - successCount,
    results,
    stats: {
      totalTime,
      averageTime: totalTime / results.length,
      errors,
    },
  };
}

/**
 * Creates optimized file lookup cache for batch operations
 * @param packageDir - Package directory
 * @param searchDirs - Directories to cache
 * @returns Map of file paths to existence status
 */
export async function createFileCache(
  packageDir: string,
  searchDirs: string[] = ['lib', 'dist', 'src', 'build']
): Promise<Map<string, boolean>> {
  const cache = new Map<string, boolean>();

  for (const searchDir of searchDirs) {
    const dirPath = join(packageDir, searchDir);

    try {
      const files = getAllFilesRecursive(dirPath);
      for (const file of files) {
        const relativePath = relative(packageDir, file);
        cache.set(relativePath, true);
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return cache;
}

/**
 * Gets file existence from cache with fallback
 * @param filePath - File path to check
 * @param cache - File existence cache
 * @param packageDir - Package directory for fallback
 * @returns Whether file exists
 */
export function getFileExistenceFromCache(
  filePath: string,
  cache: Map<string, boolean>,
  packageDir: string
): boolean {
  const cleanPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;

  // Check cache first
  if (cache.has(cleanPath)) {
    return cache.get(cleanPath) || false;
  }

  // Fallback to direct check
  const fullPath = join(packageDir, cleanPath);
  const exists = fileExistsSync(fullPath).exists;

  // Update cache
  cache.set(cleanPath, exists);

  return exists;
}

/**
 * Utility function to split array into chunks
 * @param array - Array to chunk
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Recursively gets all files from a directory
 * @param dirPath - Directory path
 * @returns Array of file paths
 */
function getAllFilesRecursive(dirPath: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      const stat = statSync(entryPath);

      if (stat.isFile()) {
        files.push(entryPath);
      } else if (stat.isDirectory()) {
        const subFiles = getAllFilesRecursive(entryPath);
        files.push(...subFiles);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}
