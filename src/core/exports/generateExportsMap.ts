import { readFile } from 'fs/promises';
import type { ExportsMap, PackageUsage } from '../../types.js';
import { generateBaselineExports } from './generateBaselineExports.js';
import { generateExportEntry } from '../packages/generateExportEntry.js';

export interface PackageInfo {
  name: string;
  path: string;
  packageJsonPath: string;
}

/**
 * Generates complete exports map for a package
 * @param pkg - Package information
 * @param usage - Usage data for the package
 * @returns Promise resolving to exports map
 */
export async function generateExportsMap(
  pkg: PackageInfo,
  usage: PackageUsage
): Promise<ExportsMap> {
  // Read the package.json to get baseline exports
  const packageJsonContent = await readFile(pkg.packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  // Only generate baseline exports if no exports field exists
  let exportsMap: ExportsMap;
  if (!packageJson.exports) {
    exportsMap = await generateBaselineExports(packageJson, pkg.path);
  } else {
    exportsMap = { ...packageJson.exports };
  }

  // Add exports for usage-based import paths (only if they don't already exist)
  for (const importPath of usage.importPaths) {
    if (importPath === '.' && exportsMap['.']) {
      continue; // Skip root export if it already exists
    }

    if (exportsMap[importPath]) {
      console.log(`Skipping ${importPath} for ${pkg.name}: export already exists`);
      continue; // Skip if export already exists
    }

    const exportEntry = await generateExportEntry(importPath, pkg.path);
    if (exportEntry) {
      exportsMap[importPath] = exportEntry;
      console.log(`Added new export ${importPath} for ${pkg.name}`);
    }
  }

  return exportsMap;
}
