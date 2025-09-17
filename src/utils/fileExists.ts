import { existsSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Result of file existence check
 */
export interface FileExistsResult {
  exists: boolean;
  path?: string;
  type?: 'file' | 'directory';
}

/**
 * Checks if a file exists at the given path
 * @param filePath - Absolute or relative path to check
 * @returns Promise resolving to whether the file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = statSync(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Checks if a directory exists at the given path
 * @param dirPath - Absolute or relative path to check
 * @returns Promise resolving to whether the directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Finds the first existing file by trying multiple extensions
 * @param basePath - Base path without extension
 * @param extensions - Array of extensions to try (with leading dot)
 * @returns Promise resolving to the first found file path or null
 */
export async function findExistingFile(
  basePath: string,
  extensions: string[]
): Promise<string | null> {
  for (const extension of extensions) {
    const filePath = `${basePath}${extension}`;
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Synchronous version of fileExists for performance-critical operations
 * @param filePath - Path to check
 * @returns FileExistsResult with detailed information
 */
export function fileExistsSync(filePath: string): FileExistsResult {
  try {
    if (!existsSync(filePath)) {
      return { exists: false };
    }

    const stats = statSync(filePath);
    return {
      exists: true,
      path: filePath,
      type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : undefined,
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Synchronous version of findExistingFile for performance-critical operations
 * @param basePath - Base path without extension
 * @param extensions - Array of extensions to try
 * @returns First found file path or null
 */
export function findExistingFileSync(basePath: string, extensions: string[]): string | null {
  for (const extension of extensions) {
    const filePath = `${basePath}${extension}`;
    const result = fileExistsSync(filePath);
    if (result.exists && result.type === 'file') {
      return filePath;
    }
  }
  return null;
}

/**
 * Batch checks multiple file paths for existence
 * @param filePaths - Array of file paths to check
 * @returns Promise resolving to array of FileExistsResult
 */
export async function batchFileExists(filePaths: string[]): Promise<FileExistsResult[]> {
  return Promise.all(
    filePaths.map(async (path) => {
      const exists = await fileExists(path);
      return {
        exists,
        path: exists ? path : undefined,
        type: exists ? 'file' : undefined,
      };
    })
  );
}

/**
 * Finds files in a directory with specific patterns
 * @param baseDir - Directory to search in
 * @param fileName - Base filename without extension
 * @param extensions - Extensions to try
 * @returns Array of found file paths
 */
export function findFilesWithExtensions(
  baseDir: string,
  fileName: string,
  extensions: string[]
): string[] {
  const foundFiles: string[] = [];

  for (const extension of extensions) {
    const filePath = join(baseDir, `${fileName}${extension}`);
    const result = fileExistsSync(filePath);
    if (result.exists && result.type === 'file') {
      foundFiles.push(filePath);
    }
  }

  return foundFiles;
}

/**
 * Checks if an index file exists in a directory with any of the given extensions
 * @param dirPath - Directory path to check
 * @param extensions - Extensions to try for index file
 * @returns Path to found index file or null
 */
export function findIndexFile(dirPath: string, extensions: string[]): string | null {
  if (!fileExistsSync(dirPath).exists) {
    return null;
  }

  for (const extension of extensions) {
    const indexPath = join(dirPath, `index${extension}`);
    if (fileExistsSync(indexPath).type === 'file') {
      return indexPath;
    }
  }

  return null;
}
