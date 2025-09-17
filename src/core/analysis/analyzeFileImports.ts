import { readFile } from 'fs/promises';

// Pre-compiled regex for performance
const IMPORT_REGEX =
  /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|import\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;

export interface ImportMatch {
  packageName: string;
  importPath: string;
}

/**
 * Analyzes a source file for imports and extracts package usage
 * @param filePath - Path to the source file
 * @param targetPackages - Set of package names to track (if empty, tracks all)
 * @returns Array of import matches
 */
export async function analyzeFileImports(
  filePath: string,
  targetPackages: Set<string> = new Set()
): Promise<ImportMatch[]> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const imports: ImportMatch[] = [];
    let match;

    while ((match = IMPORT_REGEX.exec(content)) !== null) {
      // Get the import path from whichever capture group matched
      const importPath = match[1] || match[2] || match[3];
      if (!importPath) continue;

      // Skip relative imports
      if (importPath.startsWith('.')) continue;

      // Extract package name (everything before first slash or the whole string)
      const packageName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/') // Scoped packages: @scope/name
        : importPath.split('/')[0]; // Regular packages: name

      // If we have target packages, only process those
      if (targetPackages.size > 0 && !targetPackages.has(packageName)) {
        continue;
      }

      // Calculate the import path relative to package root
      const relativeImportPath =
        importPath === packageName ? '.' : `./${importPath.slice(packageName.length + 1)}`;

      imports.push({
        packageName,
        importPath: relativeImportPath,
      });
    }

    return imports;
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}`);
    return [];
  }
}

/**
 * Extracts version requirement for a package from dependencies
 * @param packageName - Name of the package
 * @param dependencies - Combined dependencies object
 * @returns Version requirement or undefined
 */
export function extractVersionRequirement(
  packageName: string,
  dependencies: Record<string, string>
): string | undefined {
  return dependencies[packageName];
}
