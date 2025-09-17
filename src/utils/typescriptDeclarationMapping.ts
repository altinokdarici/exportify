import { join, dirname, basename, extname } from 'path';
import { readdirSync, statSync } from 'fs';
import { fileExistsSync } from './fileExists.js';

/**
 * TypeScript declaration file patterns and mappings
 */
export interface DeclarationMapping {
  /** Source file extensions that generate declarations */
  sourceExtensions: string[];
  /** Declaration file extension */
  declarationExtension: string;
  /** Whether to check for corresponding source files */
  requiresSource: boolean;
}

/**
 * Common declaration mappings for different file types
 */
export const DECLARATION_MAPPINGS: DeclarationMapping[] = [
  {
    sourceExtensions: ['.ts', '.tsx'],
    declarationExtension: '.d.ts',
    requiresSource: true,
  },
  {
    sourceExtensions: ['.js', '.jsx', '.mjs', '.cjs'],
    declarationExtension: '.d.ts',
    requiresSource: false,
  },
];

/**
 * Result of declaration file discovery
 */
export interface DeclarationResult {
  /** Path to the declaration file if found */
  declarationPath?: string;
  /** Path to the corresponding source file if found */
  sourcePath?: string;
  /** Type of mapping used */
  mappingType: 'exact' | 'inferred' | 'none';
  /** Whether the declaration file exists */
  exists: boolean;
}

/**
 * Finds TypeScript declaration files for a given JavaScript/TypeScript file
 * @param filePath - Path to the source file
 * @param packageDir - Package directory for relative path resolution
 * @param buildDirs - Build directories to search in
 * @returns Declaration file result
 */
export function findDeclarationFile(
  filePath: string,
  packageDir: string,
  buildDirs: string[] = ['lib', 'dist', 'build', 'out']
): DeclarationResult {
  const cleanPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;
  const fullPath = join(packageDir, cleanPath);

  // Check if the file is already a declaration file
  if (cleanPath.endsWith('.d.ts')) {
    const exists = fileExistsSync(fullPath).exists;
    return {
      declarationPath: exists ? cleanPath : undefined,
      mappingType: exists ? 'exact' : 'none',
      exists,
    };
  }

  // Try to find corresponding .d.ts file
  const { dir, name } = parsePath(cleanPath);

  // Method 1: Look for .d.ts file in the same directory
  const sameDirectoryDecl = join(dir, `${name}.d.ts`);
  const sameDirectoryPath = join(packageDir, sameDirectoryDecl);
  if (fileExistsSync(sameDirectoryPath).exists) {
    return {
      declarationPath: sameDirectoryDecl,
      sourcePath: cleanPath,
      mappingType: 'exact',
      exists: true,
    };
  }

  // Method 2: For files in build directories, look in other build directories
  for (const buildDir of buildDirs) {
    if (dir.startsWith(buildDir)) {
      // Try the same file in other build directories
      for (const otherBuildDir of buildDirs) {
        if (otherBuildDir === buildDir) continue;

        const relativePath = dir.slice(buildDir.length + 1);
        const otherDirDecl = join(otherBuildDir, relativePath, `${name}.d.ts`);
        const otherDirPath = join(packageDir, otherDirDecl);

        if (fileExistsSync(otherDirPath).exists) {
          return {
            declarationPath: otherDirDecl,
            sourcePath: cleanPath,
            mappingType: 'inferred',
            exists: true,
          };
        }
      }
    }
  }

  // Method 3: Generate expected declaration path based on source type
  const expectedDeclarationPath = generateExpectedDeclarationPath(cleanPath, buildDirs);
  if (expectedDeclarationPath) {
    const expectedPath = join(packageDir, expectedDeclarationPath);
    const exists = fileExistsSync(expectedPath).exists;

    return {
      declarationPath: exists ? expectedDeclarationPath : undefined,
      sourcePath: cleanPath,
      mappingType: exists ? 'inferred' : 'none',
      exists,
    };
  }

  return {
    mappingType: 'none',
    exists: false,
  };
}

/**
 * Generates the expected declaration file path for a given source file
 * @param sourcePath - Source file path
 * @param buildDirs - Build directories to consider
 * @returns Expected declaration path or null
 */
export function generateExpectedDeclarationPath(
  sourcePath: string,
  buildDirs: string[] = ['lib', 'dist', 'types']
): string | null {
  const { dir, name } = parsePath(sourcePath);

  // If it's already in a build directory, use the same directory
  for (const buildDir of buildDirs) {
    if (dir.startsWith(buildDir)) {
      return join(dir, `${name}.d.ts`);
    }
  }

  // If it's a source file, map to the first build directory
  if (dir.startsWith('src/') || dir.startsWith('source/')) {
    const relativePath = dir.replace(/^(src|source)\//, '');
    return join(buildDirs[0], relativePath, `${name}.d.ts`);
  }

  // Default to lib directory
  return join('lib', dir, `${name}.d.ts`);
}

/**
 * Maps a source file to its expected declaration file location
 * @param sourcePath - TypeScript source file path
 * @param outputDir - Build output directory
 * @returns Expected declaration file path
 */
export function mapSourceToDeclaration(sourcePath: string, outputDir: string = 'lib'): string {
  const cleanPath = sourcePath.startsWith('./') ? sourcePath.slice(2) : sourcePath;
  const { dir, name } = parsePath(cleanPath);

  // Remove source directory prefix if present
  const relativeDir = dir.replace(/^(src|source)(?:\/|$)/, '');

  return join(outputDir, relativeDir, `${name}.d.ts`);
}

/**
 * Finds all declaration files in a package
 * @param packageDir - Package directory
 * @param buildDirs - Build directories to search
 * @returns Array of declaration file paths
 */
export function findAllDeclarationFiles(
  packageDir: string,
  buildDirs: string[] = ['lib', 'dist', 'build', 'out', 'types']
): string[] {
  const declarationFiles: string[] = [];

  for (const buildDir of buildDirs) {
    const buildPath = join(packageDir, buildDir);
    if (fileExistsSync(buildPath).type === 'directory') {
      const files = findDeclarationFilesInDirectory(buildPath, buildDir);
      declarationFiles.push(...files);
    }
  }

  return declarationFiles;
}

/**
 * Recursively finds declaration files in a directory
 * @param dirPath - Directory to search
 * @param relativePath - Relative path for result
 * @returns Array of relative declaration file paths
 */
function findDeclarationFilesInDirectory(dirPath: string, relativePath: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        const subFiles = findDeclarationFilesInDirectory(entryPath, join(relativePath, entry));
        files.push(...subFiles);
      } else if (entry.endsWith('.d.ts')) {
        files.push(join(relativePath, entry));
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Validates that a declaration file correctly corresponds to a source file
 * @param declarationPath - Path to declaration file
 * @param sourcePath - Path to source file
 * @param packageDir - Package directory
 * @returns Whether the mapping is valid
 */
export function validateDeclarationMapping(
  declarationPath: string,
  sourcePath: string,
  packageDir: string
): boolean {
  const declResult = fileExistsSync(join(packageDir, declarationPath));
  const sourceResult = fileExistsSync(join(packageDir, sourcePath));

  if (!declResult.exists || !sourceResult.exists) {
    return false;
  }

  // Check that the base names match
  const declName = basename(declarationPath, '.d.ts');
  const sourceName = basename(sourcePath, extname(sourcePath));

  return declName === sourceName;
}

/**
 * Helper function to parse file path components
 * @param filePath - File path to parse
 * @returns Parsed path components
 */
function parsePath(filePath: string): { dir: string; name: string; ext: string } {
  const dir = dirname(filePath);
  const ext = extname(filePath);
  const name = basename(filePath, ext);

  return {
    dir: dir === '.' ? '' : dir,
    name,
    ext,
  };
}
