import { join } from 'path';
import { existsSync } from 'fs';
import { normalizeRelativePath } from './normalizeRelativePath.js';

/**
 * Maps common build directory patterns to their corresponding source directories
 */
const SOURCE_MAPPINGS = [
  { from: '/lib/', to: '/src/' },
  { from: '/dist/', to: '/src/' },
  { from: '/build/', to: '/source/' },
  { from: '/out/', to: '/src/' },
];

/**
 * Common source directory names to check
 */
const SOURCE_DIRECTORIES = ['src', 'source'];

/**
 * TypeScript and source file extensions to look for
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.jsx', '.js'];

/**
 * Finds the corresponding source file for a given target path
 * @param targetPath - The compiled/built file path to find source for
 * @param packageDir - Directory containing the package
 * @returns Promise resolving to normalized source path or null if not found
 */
export async function findSourceFile(
  targetPath: string,
  packageDir: string
): Promise<string | null> {
  // Remove leading './' if present
  const cleanPath = targetPath.startsWith('./') ? targetPath.slice(2) : targetPath;

  // Try source mappings first (lib -> src, dist -> src, etc.)
  for (const mapping of SOURCE_MAPPINGS) {
    if (cleanPath.includes(mapping.from)) {
      const mappedPath = cleanPath.replace(mapping.from, mapping.to);
      const sourceFile = await tryFindSourceFile(mappedPath, packageDir);
      if (sourceFile) {
        return sourceFile;
      }
    }
  }

  // Try direct source directory mapping
  for (const sourceDir of SOURCE_DIRECTORIES) {
    // Remove any build directory prefix and try in source directory
    const baseName = cleanPath
      .replace(/^(lib|dist|build|out)\//, '')
      .replace(/\.(js|mjs|cjs|d\.ts)$/, '');

    const sourceFile = await tryFindSourceFile(`${sourceDir}/${baseName}`, packageDir);
    if (sourceFile) {
      return sourceFile;
    }
  }

  return null;
}

/**
 * Attempts to find a source file at the given path with various extensions
 * @param basePath - Base path without extension
 * @param packageDir - Package directory
 * @returns Normalized relative path if found, null otherwise
 */
async function tryFindSourceFile(basePath: string, packageDir: string): Promise<string | null> {
  // Try with different extensions
  for (const ext of SOURCE_EXTENSIONS) {
    const fullPath = join(packageDir, `${basePath}${ext}`);
    if (existsSync(fullPath)) {
      return normalizeRelativePath(`${basePath}${ext}`);
    }
  }

  // Try index files in directory
  for (const ext of SOURCE_EXTENSIONS) {
    const indexPath = join(packageDir, basePath, `index${ext}`);
    if (existsSync(indexPath)) {
      return normalizeRelativePath(`${basePath}/index${ext}`);
    }
  }

  return null;
}

/**
 * Finds source file from package.json source field if present
 * @param packageJson - Package.json content
 * @param packageDir - Package directory
 * @returns Normalized source path or null if not found/specified
 */
export async function findSourceFromPackageJson(
  packageJson: Record<string, unknown>,
  packageDir: string
): Promise<string | null> {
  if (packageJson.source && typeof packageJson.source === 'string') {
    const sourcePath = join(packageDir, packageJson.source);
    if (existsSync(sourcePath)) {
      return normalizeRelativePath(packageJson.source);
    }
  }

  return null;
}
