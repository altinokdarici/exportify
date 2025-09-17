import { join } from 'path';
import { existsSync } from 'fs';
import { findSourceFile } from '../../utils/findSourceFile.js';
import { inferExportEntry } from '../../utils/inferSourceFile.js';

/**
 * Generates an export entry for a given import path by finding the actual file
 * @param importPath - The import path to generate exports for
 * @param packagePath - Path to the package directory
 * @returns Export entry object or null if no suitable file found
 */
export async function generateExportEntry(
  importPath: string,
  packagePath: string
): Promise<string | object | null> {
  // Remove leading './' if present
  const cleanPath = importPath.startsWith('./') ? importPath.slice(2) : importPath;

  // Try to detect the actual file structure
  const possibleExtensions = ['', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
  // Updated possibleBases: removed 'src' (source files are not expected in build output),
  // and added 'build' and 'out' to support additional common build output directories.
  // This ensures we only search in directories where compiled files are likely to be found.
  const possibleBases = ['lib', 'dist', 'build', 'out'];

  let foundFile: string | null = null;
  let buildDir: string | null = null;

  // Look for the file in different build directories
  for (const base of possibleBases) {
    for (const ext of possibleExtensions) {
      const testPath = join(packagePath, base, `${cleanPath}${ext}`);
      const testIndexPath = join(packagePath, base, cleanPath, `index${ext}`);

      if (existsSync(testPath)) {
        foundFile = `${cleanPath}${ext}`;
        buildDir = base;
        break;
      } else if (existsSync(testIndexPath)) {
        foundFile = `${cleanPath}/index${ext}`;
        buildDir = base;
        break;
      }
    }
    if (foundFile) break;
  }

  // If we found a file, generate appropriate export entry
  if (foundFile && buildDir) {
    const exportEntry: Record<string, string> = {};

    // Generate proper JS path for source detection and exports
    let jsPath: string;
    if (foundFile.endsWith('.ts') || foundFile.endsWith('.tsx')) {
      jsPath = `./${buildDir}/${foundFile.replace(/\.tsx?$/, '.js')}`;
    } else {
      jsPath = `./${buildDir}/${foundFile}`;
    }

    // Try to find source file
    const sourceFile = findSourceFile(jsPath, packagePath);
    if (sourceFile) {
      exportEntry.source = sourceFile;
    }

    // Check for TypeScript types
    const typesFile = foundFile.replace(/\.(js|mjs|cjs|ts|tsx)$/, '.d.ts');
    const typesPath = join(packagePath, buildDir, typesFile);
    if (existsSync(typesPath)) {
      exportEntry.types = `./${buildDir}/${typesFile}`;
    }

    // Add the main export
    exportEntry.default = jsPath;

    // For TypeScript files, assume they'll be compiled to JS
    if (foundFile.endsWith('.ts') || foundFile.endsWith('.tsx')) {
      exportEntry.import = jsPath;
    }

    return Object.keys(exportEntry).length === 1 ? exportEntry.default : exportEntry;
  }

  // If no file found, try enhanced source inference
  const inferredEntry = inferExportEntry(importPath, packagePath);
  if (inferredEntry) {
    return inferredEntry;
  }

  // Fallback: assume it will exist in lib directory
  console.warn(
    `Warning: Could not find file for import path "${importPath}" in package at ${packagePath}`
  );

  // Try to find source file for fallback case
  const fallbackJsPath = `./lib/${cleanPath}.js`;
  const fallbackSourceFile = findSourceFile(fallbackJsPath, packagePath);

  const fallbackEntry: Record<string, string> = {};
  if (fallbackSourceFile) {
    fallbackEntry.source = fallbackSourceFile;
  }
  fallbackEntry.types = `./lib/${cleanPath}.d.ts`;
  fallbackEntry.default = fallbackJsPath;

  return fallbackEntry;
}
