import { existsSync, statSync } from 'fs';
import { join } from 'path';
import type { BuildPattern } from '../analysis/detectBuildPattern.js';
import { findSourceFile } from '../../utils/findSourceFile.js';

export interface ExpandedExport {
  [condition: string]: string;
}

/**
 * Expands a usage path using detected build pattern to generate conditional exports
 * @param usagePath - The import path from usage analysis
 * @param pattern - The detected build pattern information
 * @param packageDir - Directory containing the package
 * @returns Expanded export object or null if expansion not applicable
 */
export function expandUsageWithPattern(
  usagePath: string,
  pattern: BuildPattern,
  packageDir: string
): ExpandedExport | null {
  if (!pattern.hasMultipleBuilds || !pattern.cjsPattern || !pattern.esmPattern) {
    return null;
  }

  // Remove leading './' for processing
  const cleanPath = usagePath.startsWith('./') ? usagePath.slice(2) : usagePath;

  switch (pattern.patternType) {
    case 'directory':
      return expandDirectoryPattern(cleanPath, pattern, packageDir);
    case 'extension':
      return expandExtensionPattern(cleanPath, pattern, packageDir);
    case 'prefix':
      return expandPrefixPattern(cleanPath, pattern, packageDir);
    default:
      return null;
  }
}

/**
 * Expands directory-based patterns (lib/cjs vs lib/esm)
 */
function expandDirectoryPattern(
  cleanPath: string,
  pattern: BuildPattern,
  packageDir: string
): ExpandedExport | null {
  const { cjsPattern, esmPattern } = pattern;
  if (!cjsPattern || !esmPattern) return null;

  // Check if the usage path is in a compatible base path
  const cjsBasePath = cjsPattern.basePath.startsWith('./')
    ? cjsPattern.basePath.slice(2)
    : cjsPattern.basePath;
  const esmBasePath = esmPattern.basePath.startsWith('./')
    ? esmPattern.basePath.slice(2)
    : esmPattern.basePath;

  // Extract the relative path after the base
  let relativePath: string;
  if (cleanPath.startsWith(cjsBasePath + '/')) {
    relativePath = cleanPath.slice(cjsBasePath.length + 1);
  } else if (cleanPath.startsWith(esmBasePath + '/')) {
    relativePath = cleanPath.slice(esmBasePath.length + 1);
  } else {
    // Try to infer from the clean path directly
    relativePath = cleanPath;
  }

  // Generate potential CJS and ESM paths
  const cjsPath = `${cjsBasePath}/${cjsPattern.identifier}/${relativePath}`;
  const esmPath = `${esmBasePath}/${esmPattern.identifier}/${relativePath}`;

  return generateConditionalExport(cjsPath, esmPath, cleanPath, packageDir);
}

/**
 * Expands extension-based patterns (.cjs vs .mjs)
 */
function expandExtensionPattern(
  cleanPath: string,
  pattern: BuildPattern,
  packageDir: string
): ExpandedExport | null {
  const { cjsPattern, esmPattern } = pattern;
  if (!cjsPattern || !esmPattern) return null;

  // For extension delta, the base path should be the same
  // For usage paths, we need to adapt them to this pattern
  // Remove extension from clean path and apply delta extensions
  const pathWithoutExt = cleanPath.replace(/\.[^.]+$/, '');
  const adaptedCjsPath = `${pathWithoutExt}${cjsPattern.identifier}`;
  const adaptedEsmPath = `${pathWithoutExt}${esmPattern.identifier}`;

  return generateConditionalExport(adaptedCjsPath, adaptedEsmPath, cleanPath, packageDir);
}

/**
 * Expands prefix-based patterns (cjs.file vs esm.file)
 */
function expandPrefixPattern(
  cleanPath: string,
  pattern: BuildPattern,
  packageDir: string
): ExpandedExport | null {
  const { cjsPattern, esmPattern } = pattern;
  if (!cjsPattern || !esmPattern) return null;

  // Extract filename from clean path
  const pathParts = cleanPath.split('/');
  const filename = pathParts[pathParts.length - 1];
  const dirPath = pathParts.slice(0, -1).join('/');

  // Generate prefixed filenames
  const cjsFilename = `${cjsPattern.identifier}.${filename}`;
  const esmFilename = `${esmPattern.identifier}.${filename}`;

  const cjsPath = dirPath ? `${dirPath}/${cjsFilename}` : cjsFilename;
  const esmPath = dirPath ? `${dirPath}/${esmFilename}` : esmFilename;

  return generateConditionalExport(cjsPath, esmPath, cleanPath, packageDir);
}

/**
 * Generates a conditional export object with proper validation
 */
function generateConditionalExport(
  cjsPath: string,
  esmPath: string,
  originalPath: string,
  packageDir: string
): ExpandedExport | null {
  const exportEntry: ExpandedExport = {};

  // Try different extensions for each path
  const extensions = ['', '.js', '.mjs', '.cjs'];
  let validCjsPath: string | null = null;
  let validEsmPath: string | null = null;
  let validOriginalPath: string | null = null;

  // Find valid CJS path
  for (const ext of extensions) {
    const testPath = `${cjsPath}${ext}`;
    const fullPath = join(packageDir, testPath);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      validCjsPath = `./${testPath}`;
      break;
    }
    // Also try with index.js
    const indexPath = `${cjsPath}/index${ext}`;
    const fullIndexPath = join(packageDir, indexPath);
    if (existsSync(fullIndexPath) && statSync(fullIndexPath).isFile()) {
      validCjsPath = `./${indexPath}`;
      break;
    }
  }

  // Find valid ESM path
  for (const ext of extensions) {
    const testPath = `${esmPath}${ext}`;
    const fullPath = join(packageDir, testPath);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      validEsmPath = `./${testPath}`;
      break;
    }
    // Also try with index.js
    const indexPath = `${esmPath}/index${ext}`;
    const fullIndexPath = join(packageDir, indexPath);
    if (existsSync(fullIndexPath) && statSync(fullIndexPath).isFile()) {
      validEsmPath = `./${indexPath}`;
      break;
    }
  }

  // Find valid original path
  for (const ext of extensions) {
    const testPath = `${originalPath}${ext}`;
    const fullPath = join(packageDir, testPath);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      validOriginalPath = `./${testPath}`;
      break;
    }
    // Also try with index.js
    const indexPath = `${originalPath}/index${ext}`;
    const fullIndexPath = join(packageDir, indexPath);
    if (existsSync(fullIndexPath) && statSync(fullIndexPath).isFile()) {
      validOriginalPath = `./${indexPath}`;
      break;
    }
  }

  // Need at least one valid path to proceed
  if (!validCjsPath && !validEsmPath && !validOriginalPath) {
    return null;
  }

  // Try to find source file
  // For pattern-based exports, use the original path to find source
  const originalJsPath = `./${originalPath}`;
  const sourceFile = findSourceFile(originalJsPath, packageDir);
  if (sourceFile) {
    exportEntry.source = sourceFile;
  }

  // Look for TypeScript declarations
  // For pattern-based exports, try to find types in the original path location
  const originalTypesPath = `./${originalPath.replace(/\.m?js$/, '.d.ts')}`;
  const fullOriginalTypesPath = join(packageDir, originalTypesPath.slice(2));
  if (existsSync(fullOriginalTypesPath)) {
    exportEntry.types = originalTypesPath;
  } else {
    // Fallback: look for types alongside the actual files
    const fallbackTypesPath = (validOriginalPath || validEsmPath || validCjsPath)?.replace(
      /\.m?js$/,
      '.d.ts'
    );
    if (fallbackTypesPath) {
      const fullTypesPath = join(packageDir, fallbackTypesPath.slice(2)); // Remove './'
      if (existsSync(fullTypesPath)) {
        exportEntry.types = fallbackTypesPath;
      }
    }
  }

  // Add conditional exports
  if (validEsmPath) {
    exportEntry.import = validEsmPath;
  }

  if (validCjsPath) {
    exportEntry.require = validCjsPath;
  }

  // Add default export (prefer original, then ESM, then CJS)
  const defaultPath = validOriginalPath || validEsmPath || validCjsPath;
  if (defaultPath) {
    exportEntry.default = defaultPath;
  }

  // Return null if we couldn't generate any meaningful exports
  if (Object.keys(exportEntry).length === 0) {
    return null;
  }

  return exportEntry;
}
