import { join, relative, dirname } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileExistsSync } from './fileExists.js';
import { findAllDeclarationFiles } from './typescriptDeclarationMapping.js';

/**
 * Detected build output structure information
 */
export interface BuildStructure {
  /** Detected build directories */
  buildDirs: string[];
  /** Source directories */
  sourceDirs: string[];
  /** Whether the structure preserves source directory layout */
  preservesStructure: boolean;
  /** Detected TypeScript configuration */
  typescript: {
    hasDeclarations: boolean;
    declarationDir?: string;
    outDir?: string;
  };
  /** Package.json field mappings */
  packageFields: {
    main?: string;
    module?: string;
    types?: string;
    exports?: boolean;
  };
  /** Detected file patterns */
  patterns: {
    hasIndexFiles: boolean;
    commonExtensions: string[];
    buildFileCount: number;
  };
}

/**
 * Common build directory patterns
 */
export const COMMON_BUILD_DIRS = [
  'lib',
  'dist',
  'build',
  'out',
  'output',
  'compiled',
  'types',
  'esm',
  'cjs',
  'umd',
];

/**
 * Common source directory patterns
 */
export const COMMON_SOURCE_DIRS = ['src', 'source', 'lib-src', 'packages'];

/**
 * Analyzes the build output structure of a package
 * @param packageDir - Package directory to analyze
 * @returns Detected build structure information
 */
export function detectBuildStructure(packageDir: string): BuildStructure {
  const structure: BuildStructure = {
    buildDirs: [],
    sourceDirs: [],
    preservesStructure: false,
    typescript: {
      hasDeclarations: false,
    },
    packageFields: {},
    patterns: {
      hasIndexFiles: false,
      commonExtensions: [],
      buildFileCount: 0,
    },
  };

  // Detect build directories
  structure.buildDirs = detectBuildDirectories(packageDir);

  // Detect source directories
  structure.sourceDirs = detectSourceDirectories(packageDir);

  // Analyze package.json
  structure.packageFields = analyzePackageJson(packageDir);

  // Analyze TypeScript configuration
  structure.typescript = analyzeTypeScriptStructure(packageDir, structure.buildDirs);

  // Detect if structure is preserved
  structure.preservesStructure = detectStructurePreservation(
    packageDir,
    structure.sourceDirs,
    structure.buildDirs
  );

  // Analyze file patterns
  structure.patterns = analyzeFilePatterns(packageDir, structure.buildDirs);

  return structure;
}

/**
 * Detects build directories in a package
 * @param packageDir - Package directory
 * @returns Array of detected build directory names
 */
export function detectBuildDirectories(packageDir: string): string[] {
  const buildDirs: string[] = [];

  for (const dir of COMMON_BUILD_DIRS) {
    const dirPath = join(packageDir, dir);
    if (fileExistsSync(dirPath).type === 'directory') {
      // Check if it actually contains compiled files
      if (containsCompiledFiles(dirPath)) {
        buildDirs.push(dir);
      }
    }
  }

  return buildDirs;
}

/**
 * Detects source directories in a package
 * @param packageDir - Package directory
 * @returns Array of detected source directory names
 */
export function detectSourceDirectories(packageDir: string): string[] {
  const sourceDirs: string[] = [];

  for (const dir of COMMON_SOURCE_DIRS) {
    const dirPath = join(packageDir, dir);
    if (fileExistsSync(dirPath).type === 'directory') {
      // Check if it contains source files
      if (containsSourceFiles(dirPath)) {
        sourceDirs.push(dir);
      }
    }
  }

  return sourceDirs;
}

/**
 * Analyzes package.json for build-related configuration
 * @param packageDir - Package directory
 * @returns Package field analysis
 */
function analyzePackageJson(packageDir: string): BuildStructure['packageFields'] {
  const packageJsonPath = join(packageDir, 'package.json');
  const result: BuildStructure['packageFields'] = {};

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

    if (packageJson.main) result.main = packageJson.main;
    if (packageJson.module) result.module = packageJson.module;
    if (packageJson.types || packageJson.typings) {
      result.types = packageJson.types || packageJson.typings;
    }
    if (packageJson.exports) result.exports = true;
  } catch {
    // Package.json doesn't exist or is invalid
  }

  return result;
}

/**
 * Analyzes TypeScript-specific build structure
 * @param packageDir - Package directory
 * @param buildDirs - Detected build directories
 * @returns TypeScript structure analysis
 */
function analyzeTypeScriptStructure(
  packageDir: string,
  buildDirs: string[]
): BuildStructure['typescript'] {
  const result: BuildStructure['typescript'] = {
    hasDeclarations: false,
  };

  // Check for declaration files
  const declarationFiles = findAllDeclarationFiles(packageDir, buildDirs);
  result.hasDeclarations = declarationFiles.length > 0;

  // Try to detect declaration and output directories
  if (result.hasDeclarations) {
    // Find the most common directory for declarations
    const declarationDirs = declarationFiles.map((file) => dirname(file));
    const dirCounts = declarationDirs.reduce(
      (acc, dir) => {
        const topLevel = dir.split('/')[0];
        acc[topLevel] = (acc[topLevel] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const mostCommonDir = Object.entries(dirCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

    if (mostCommonDir) {
      result.declarationDir = mostCommonDir;
    }
  }

  // Check for TypeScript config files
  const tsconfigPath = join(packageDir, 'tsconfig.json');
  if (fileExistsSync(tsconfigPath).exists) {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));

      if (tsconfig.compilerOptions?.outDir) {
        result.outDir = tsconfig.compilerOptions.outDir;
      }
      if (tsconfig.compilerOptions?.declarationDir) {
        result.declarationDir = tsconfig.compilerOptions.declarationDir;
      }
    } catch {
      // Invalid tsconfig.json
    }
  }

  return result;
}

/**
 * Detects if the build preserves source directory structure
 * @param packageDir - Package directory
 * @param sourceDirs - Source directories
 * @param buildDirs - Build directories
 * @returns Whether structure is preserved
 */
function detectStructurePreservation(
  packageDir: string,
  sourceDirs: string[],
  buildDirs: string[]
): boolean {
  if (sourceDirs.length === 0 || buildDirs.length === 0) {
    return false;
  }

  // Sample some files from source and see if they exist in build with same structure
  for (const sourceDir of sourceDirs) {
    const sourcePath = join(packageDir, sourceDir);
    const sampleFiles = getSampleFiles(sourcePath, 5);

    for (const sampleFile of sampleFiles) {
      const relativeToSource = relative(sourcePath, sampleFile);
      const baseNameWithoutExt = relativeToSource.replace(/\.[^.]+$/, '');

      // Check if corresponding file exists in any build directory
      let found = false;
      for (const buildDir of buildDirs) {
        const expectedPath = join(packageDir, buildDir, `${baseNameWithoutExt}.js`);
        if (fileExistsSync(expectedPath).exists) {
          found = true;
          break;
        }
      }

      if (!found) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Analyzes file patterns in build directories
 * @param packageDir - Package directory
 * @param buildDirs - Build directories to analyze
 * @returns File pattern analysis
 */
function analyzeFilePatterns(packageDir: string, buildDirs: string[]): BuildStructure['patterns'] {
  const patterns: BuildStructure['patterns'] = {
    hasIndexFiles: false,
    commonExtensions: [],
    buildFileCount: 0,
  };

  const extensionCounts: Record<string, number> = {};
  let totalFiles = 0;

  for (const buildDir of buildDirs) {
    const buildPath = join(packageDir, buildDir);
    const files = getAllFiles(buildPath);

    totalFiles += files.length;

    // Count extensions
    for (const file of files) {
      const ext = getFileExtension(file);
      extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;

      // Check for index files
      if (file.includes('index.')) {
        patterns.hasIndexFiles = true;
      }
    }
  }

  patterns.buildFileCount = totalFiles;

  // Get most common extensions
  patterns.commonExtensions = Object.entries(extensionCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ext]) => ext);

  return patterns;
}

/**
 * Checks if a directory contains compiled/built files
 * @param dirPath - Directory path to check
 * @returns Whether directory contains build files
 */
function containsCompiledFiles(dirPath: string): boolean {
  try {
    const files = readdirSync(dirPath);
    const compiledExtensions = ['.js', '.mjs', '.cjs', '.d.ts'];

    return files.some((file: string) => compiledExtensions.some((ext) => file.endsWith(ext)));
  } catch {
    return false;
  }
}

/**
 * Checks if a directory contains source files
 * @param dirPath - Directory path to check
 * @returns Whether directory contains source files
 */
function containsSourceFiles(dirPath: string): boolean {
  try {
    const files = readdirSync(dirPath);
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];

    return files.some((file: string) => sourceExtensions.some((ext) => file.endsWith(ext)));
  } catch {
    return false;
  }
}

/**
 * Gets a sample of files from a directory (for structure analysis)
 * @param dirPath - Directory to sample from
 * @param maxCount - Maximum number of files to return
 * @returns Array of file paths
 */
function getSampleFiles(dirPath: string, maxCount: number): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries.slice(0, maxCount)) {
      const entryPath = join(dirPath, entry);
      const stat = statSync(entryPath);

      if (stat.isFile()) {
        files.push(entryPath);
      } else if (stat.isDirectory() && files.length < maxCount) {
        const subFiles = getSampleFiles(entryPath, maxCount - files.length);
        files.push(...subFiles);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Gets all files recursively from a directory
 * @param dirPath - Directory to scan
 * @returns Array of all file paths
 */
function getAllFiles(dirPath: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      const stat = statSync(entryPath);

      if (stat.isFile()) {
        files.push(entryPath);
      } else if (stat.isDirectory()) {
        const subFiles = getAllFiles(entryPath);
        files.push(...subFiles);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

/**
 * Gets file extension including compound extensions like .d.ts
 * @param filePath - File path
 * @returns File extension
 */
function getFileExtension(filePath: string): string {
  if (filePath.endsWith('.d.ts')) {
    return '.d.ts';
  }

  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.slice(lastDot);
}

/**
 * Gets a recommended build configuration based on detected structure
 * @param structure - Detected build structure
 * @returns Recommended configuration
 */
export function getRecommendedConfig(structure: BuildStructure): {
  outputDir: string;
  sourceDir: string;
  preserveStructure: boolean;
  generateDeclarations: boolean;
} {
  return {
    outputDir: structure.buildDirs[0] || 'lib',
    sourceDir: structure.sourceDirs[0] || 'src',
    preserveStructure: structure.preservesStructure,
    generateDeclarations: structure.typescript.hasDeclarations,
  };
}
