import { join, dirname, basename, extname, relative } from 'path';
import { fileExistsSync, findIndexFile } from './fileExists.js';

/**
 * Configuration for file discovery patterns
 */
export interface FileDiscoveryConfig {
  /** Extensions to try in order of preference */
  extensions: string[];
  /** Whether to try index files in directories */
  tryIndexFiles: boolean;
  /** Base directories to search in */
  searchDirs: string[];
  /** Whether to preserve directory structure */
  preserveStructure: boolean;
}

/**
 * Result of multi-extension file discovery
 */
export interface DiscoveryResult {
  /** Found file path if any */
  filePath?: string;
  /** Type of discovery used */
  discoveryType: 'exact' | 'extension' | 'index' | 'directory' | 'none';
  /** All potential matches found */
  alternatives: string[];
  /** The extension that was matched */
  matchedExtension?: string;
}

/**
 * Default configuration for different file types
 */
export const DEFAULT_CONFIGS: Record<string, FileDiscoveryConfig> = {
  javascript: {
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    tryIndexFiles: true,
    searchDirs: ['lib', 'dist', 'build', 'out'],
    preserveStructure: true,
  },
  typescript: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    tryIndexFiles: true,
    searchDirs: ['src', 'source', 'lib', 'dist'],
    preserveStructure: true,
  },
  declarations: {
    extensions: ['.d.ts', '.d.mts', '.d.cts'],
    tryIndexFiles: true,
    searchDirs: ['types', 'lib', 'dist', '@types'],
    preserveStructure: true,
  },
  module: {
    extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'],
    tryIndexFiles: true,
    searchDirs: ['lib', 'dist', 'src', 'build', 'out'],
    preserveStructure: true,
  },
};

/**
 * Discovers files using multiple extension patterns and search strategies
 * @param targetPath - Base path to search for (without extension)
 * @param packageDir - Package directory
 * @param config - Discovery configuration
 * @returns Discovery result with found files and alternatives
 */
export function discoverFiles(
  targetPath: string,
  packageDir: string,
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module
): DiscoveryResult {
  const cleanPath = targetPath.startsWith('./') ? targetPath.slice(2) : targetPath;
  const alternatives: string[] = [];

  // Method 1: Check if exact path exists (already has extension)
  if (extname(cleanPath)) {
    const fullPath = join(packageDir, cleanPath);
    if (fileExistsSync(fullPath).type === 'file') {
      return {
        filePath: cleanPath,
        discoveryType: 'exact',
        alternatives: [cleanPath],
        matchedExtension: extname(cleanPath),
      };
    }
  }

  // Method 2: Try different extensions
  const { dir, baseName } = parseTargetPath(cleanPath);

  for (const searchDir of config.searchDirs) {
    // If target path already starts with this search directory, use it directly
    let searchPath: string;
    if (config.preserveStructure && dir) {
      if (dir.startsWith(searchDir) && (dir === searchDir || dir.startsWith(searchDir + '/'))) {
        // Target path already includes this search directory
        searchPath = dir;
      } else {
        // Add search directory prefix
        searchPath = join(searchDir, dir);
      }
    } else {
      searchPath = searchDir;
    }

    // Try each extension
    for (const ext of config.extensions) {
      const candidatePath = join(searchPath, `${baseName}${ext}`);
      const fullPath = join(packageDir, candidatePath);

      if (fileExistsSync(fullPath).type === 'file') {
        return {
          filePath: candidatePath,
          discoveryType: 'extension',
          alternatives: alternatives.concat(candidatePath),
          matchedExtension: ext,
        };
      }
      alternatives.push(candidatePath);
    }

    // Method 3: Try index files if enabled
    if (config.tryIndexFiles) {
      const dirPath = join(searchPath, baseName);
      const fullDirPath = join(packageDir, dirPath);

      if (fileExistsSync(fullDirPath).type === 'directory') {
        const indexFile = findIndexFile(fullDirPath, config.extensions);
        if (indexFile) {
          const relativePath = relative(packageDir, indexFile);
          return {
            filePath: relativePath,
            discoveryType: 'index',
            alternatives: alternatives.concat(relativePath),
            matchedExtension: extname(indexFile),
          };
        }
      }
    }
  }

  return {
    discoveryType: 'none',
    alternatives,
  };
}

/**
 * Discovers multiple files matching a pattern
 * @param pattern - Glob-like pattern or base path
 * @param packageDir - Package directory
 * @param config - Discovery configuration
 * @returns Array of discovery results
 */
export function discoverMultipleFiles(
  pattern: string,
  packageDir: string,
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module
): DiscoveryResult[] {
  const results: DiscoveryResult[] = [];

  // For now, treat as a single file discovery
  // Could be extended to support glob patterns
  const result = discoverFiles(pattern, packageDir, config);
  if (result.filePath) {
    results.push(result);
  }

  return results;
}

/**
 * Finds the best matching file for an import path
 * @param importPath - Import path from source code
 * @param packageDir - Package directory
 * @param preferredType - Preferred file type configuration
 * @returns Best matching file or null
 */
export function findBestMatch(
  importPath: string,
  packageDir: string,
  preferredType: keyof typeof DEFAULT_CONFIGS = 'module'
): string | null {
  const config = DEFAULT_CONFIGS[preferredType];
  const result = discoverFiles(importPath, packageDir, config);
  return result.filePath || null;
}

/**
 * Resolves a module path to an actual file, handling directory imports
 * @param modulePath - Module path to resolve
 * @param packageDir - Package directory
 * @param config - Discovery configuration
 * @returns Resolved file path or null
 */
export function resolveModulePath(
  modulePath: string,
  packageDir: string,
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module
): string | null {
  // First try direct file resolution
  const directResult = discoverFiles(modulePath, packageDir, config);
  if (directResult.filePath) {
    return directResult.filePath;
  }

  // If no direct match, try as directory with index file
  const cleanPath = modulePath.startsWith('./') ? modulePath.slice(2) : modulePath;

  for (const searchDir of config.searchDirs) {
    const dirPath = join(packageDir, searchDir, cleanPath);
    if (fileExistsSync(dirPath).type === 'directory') {
      const indexFile = findIndexFile(dirPath, config.extensions);
      if (indexFile) {
        return relative(packageDir, indexFile);
      }
    }
  }

  return null;
}

/**
 * Gets all possible file variations for a given path
 * @param targetPath - Target path to get variations for
 * @param packageDir - Package directory
 * @param config - Discovery configuration
 * @returns Array of all possible file paths
 */
export function getFileVariations(
  targetPath: string,
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module
): string[] {
  const variations: string[] = [];
  const cleanPath = targetPath.startsWith('./') ? targetPath.slice(2) : targetPath;
  const { dir, baseName } = parseTargetPath(cleanPath);

  for (const searchDir of config.searchDirs) {
    // If target path already starts with this search directory, use it directly
    let searchPath: string;
    if (config.preserveStructure && dir) {
      if (dir.startsWith(searchDir) && (dir === searchDir || dir.startsWith(searchDir + '/'))) {
        // Target path already includes this search directory
        searchPath = dir;
      } else {
        // Add search directory prefix
        searchPath = join(searchDir, dir);
      }
    } else {
      searchPath = searchDir;
    }

    // Add extension variations
    for (const ext of config.extensions) {
      const variation = join(searchPath, `${baseName}${ext}`);
      variations.push(variation);
    }

    // Add index file variations
    if (config.tryIndexFiles) {
      for (const ext of config.extensions) {
        const indexVariation = join(searchPath, baseName, `index${ext}`);
        variations.push(indexVariation);
      }
    }
  }

  return variations;
}

/**
 * Analyzes file discovery statistics for a package
 * @param packageDir - Package directory
 * @param importPaths - Array of import paths to analyze
 * @param config - Discovery configuration
 * @returns Statistics about file discovery success rates
 */
export interface DiscoveryStats {
  totalPaths: number;
  foundPaths: number;
  successRate: number;
  discoveryTypes: Record<string, number>;
  missingPaths: string[];
}

export function analyzeDiscoveryStats(
  packageDir: string,
  importPaths: string[],
  config: FileDiscoveryConfig = DEFAULT_CONFIGS.module
): DiscoveryStats {
  const stats: DiscoveryStats = {
    totalPaths: importPaths.length,
    foundPaths: 0,
    successRate: 0,
    discoveryTypes: {},
    missingPaths: [],
  };

  for (const importPath of importPaths) {
    const result = discoverFiles(importPath, packageDir, config);

    if (result.filePath) {
      stats.foundPaths++;
      stats.discoveryTypes[result.discoveryType] =
        (stats.discoveryTypes[result.discoveryType] || 0) + 1;
    } else {
      stats.missingPaths.push(importPath);
    }
  }

  stats.successRate = stats.totalPaths > 0 ? (stats.foundPaths / stats.totalPaths) * 100 : 0;

  return stats;
}

/**
 * Helper function to parse target path components
 * @param targetPath - Path to parse
 * @returns Parsed components
 */
function parseTargetPath(targetPath: string): { dir: string; baseName: string } {
  const dir = dirname(targetPath);
  const baseName = basename(targetPath, extname(targetPath));

  return {
    dir: dir === '.' ? '' : dir,
    baseName,
  };
}
