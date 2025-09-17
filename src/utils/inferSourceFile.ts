import { join } from 'path';
import { existsSync } from 'fs';
import { normalizeRelativePath } from './normalizeRelativePath.js';

/**
 * Source mapping configuration for directory structure inference
 */
export interface SourceMapping {
  sourceDir: string; // e.g., "src"
  outputDir: string; // e.g., "lib" | "dist"
  preserveStructure: boolean; // maintain directory structure
}

/**
 * Common source-to-output directory mappings
 */
export const COMMON_MAPPINGS: SourceMapping[] = [
  { sourceDir: 'src', outputDir: 'lib', preserveStructure: true },
  { sourceDir: 'src', outputDir: 'dist', preserveStructure: true },
  { sourceDir: 'source', outputDir: 'lib', preserveStructure: true },
  { sourceDir: 'source', outputDir: 'dist', preserveStructure: true },
  { sourceDir: 'src', outputDir: 'build', preserveStructure: true },
  { sourceDir: 'src', outputDir: 'out', preserveStructure: true },
];

/**
 * File extension mappings for compilation
 */
export const EXTENSION_MAPPINGS = {
  '.js': ['.ts', '.tsx', '.jsx', '.js'],
  '.mjs': ['.ts', '.tsx', '.mts', '.mjs'],
  '.cjs': ['.ts', '.tsx', '.cts', '.cjs'],
  '.d.ts': ['.ts', '.tsx'],
} as const;

/**
 * Result of source file inference
 */
export interface SourceInferenceResult {
  /** Whether the target file actually exists */
  targetExists: boolean;
  /** Inferred source file path if found */
  sourcePath?: string;
  /** The mapping used for inference */
  mapping?: SourceMapping;
  /** Suggested output path based on source */
  suggestedOutput?: string;
}

/**
 * Infers source file location for a target output path when the target doesn't exist
 * @param targetPath - The target output file path (e.g., "./lib/utils.js")
 * @param packageDir - Directory containing the package
 * @param customMappings - Optional custom source mappings to try first
 * @returns Source inference result
 */
export function inferSourceFile(
  targetPath: string,
  packageDir: string,
  customMappings: SourceMapping[] = []
): SourceInferenceResult {
  // Normalize the target path
  const cleanPath = targetPath.startsWith('./') ? targetPath.slice(2) : targetPath;
  const absoluteTargetPath = join(packageDir, cleanPath);

  // Check if target file already exists
  const targetExists = existsSync(absoluteTargetPath);

  if (targetExists) {
    return { targetExists: true };
  }

  // Try custom mappings first, then common mappings
  const mappingsToTry = [...customMappings, ...COMMON_MAPPINGS];

  for (const mapping of mappingsToTry) {
    // Check if the target path matches this output directory
    if (!cleanPath.startsWith(`${mapping.outputDir}/`)) {
      continue;
    }

    // Extract the relative path within the output directory
    const relativePath = cleanPath.slice(mapping.outputDir.length + 1);

    // Try to find source file with extension mapping
    const sourceResult = tryFindSourceForTarget(relativePath, mapping, packageDir);
    if (sourceResult) {
      return {
        targetExists: false,
        sourcePath: sourceResult.sourcePath,
        mapping,
        suggestedOutput: normalizeRelativePath(cleanPath),
      };
    }
  }

  return { targetExists: false };
}

/**
 * Finds the most appropriate source file for a given target path
 * @param relativePath - Path relative to output directory
 * @param mapping - Source mapping to use
 * @param packageDir - Package directory
 * @returns Source file info if found
 */
function tryFindSourceForTarget(
  relativePath: string,
  mapping: SourceMapping,
  packageDir: string
): { sourcePath: string } | null {
  // Remove file extension to get base name
  const { baseName, extension } = parseFileExtension(relativePath);

  // Get possible source extensions for this target extension
  const possibleExtensions = EXTENSION_MAPPINGS[extension as keyof typeof EXTENSION_MAPPINGS] || [
    extension,
  ];

  // Try each possible source extension
  for (const sourceExt of possibleExtensions) {
    const sourcePath = join(mapping.sourceDir, `${baseName}${sourceExt}`);
    const absoluteSourcePath = join(packageDir, sourcePath);

    if (existsSync(absoluteSourcePath)) {
      return { sourcePath: normalizeRelativePath(sourcePath) };
    }

    // Also try index files for directory imports
    if (!baseName.endsWith('/index')) {
      const indexSourcePath = join(mapping.sourceDir, baseName, `index${sourceExt}`);
      const absoluteIndexPath = join(packageDir, indexSourcePath);

      if (existsSync(absoluteIndexPath)) {
        return { sourcePath: normalizeRelativePath(indexSourcePath) };
      }
    }
  }

  return null;
}

/**
 * Parses file extension from a path
 * @param filePath - File path to parse
 * @returns Base name and extension
 */
function parseFileExtension(filePath: string): { baseName: string; extension: string } {
  // Handle .d.ts files specially
  if (filePath.endsWith('.d.ts')) {
    return {
      baseName: filePath.slice(0, -5),
      extension: '.d.ts',
    };
  }

  const lastDotIndex = filePath.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { baseName: filePath, extension: '' };
  }

  return {
    baseName: filePath.slice(0, lastDotIndex),
    extension: filePath.slice(lastDotIndex),
  };
}

/**
 * Infers a complete export entry for a target path that doesn't exist yet
 * @param importPath - The import path to generate exports for
 * @param packageDir - Package directory
 * @param customMappings - Optional custom source mappings
 * @returns Export entry with inferred paths
 */
export function inferExportEntry(
  importPath: string,
  packageDir: string,
  customMappings: SourceMapping[] = []
): Record<string, string> | null {
  // Remove leading './' if present
  const cleanPath = importPath.startsWith('./') ? importPath.slice(2) : importPath;

  // Try to infer for common output patterns
  const outputPatterns = [
    `lib/${cleanPath}.js`,
    `dist/${cleanPath}.js`,
    `build/${cleanPath}.js`,
    `out/${cleanPath}.js`,
  ];

  for (const outputPath of outputPatterns) {
    const inference = inferSourceFile(`./${outputPath}`, packageDir, customMappings);

    if (inference.sourcePath) {
      const exportEntry: Record<string, string> = {};

      // Add source condition
      exportEntry.source = inference.sourcePath;

      // Add types if TypeScript source
      if (inference.sourcePath.endsWith('.ts') || inference.sourcePath.endsWith('.tsx')) {
        const { baseName } = parseFileExtension(outputPath);
        exportEntry.types = `./${baseName}.d.ts`;
      }

      // Add import/default conditions
      exportEntry.import = `./${outputPath}`;
      exportEntry.default = `./${outputPath}`;

      return exportEntry;
    }
  }

  return null;
}
