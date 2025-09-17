import { readFile, writeFile } from 'fs/promises';
import type { UsageData, ExportsMap } from '../types.js';
import { findPackages } from '../core/packages/findPackages.js';
import { generateExportsMap } from '../core/exports/generateExportsMap.js';

export interface FixOptions {
  cwd: string;
  dryRun?: boolean;
  packageName?: string;
}

/**
 * Fixes exports for packages based on usage data
 * @param cwd - Working directory containing packages
 * @param usageFile - Path to usage.json file
 * @param options - Fix options
 */
export async function fixExports(
  cwd: string,
  usageFile: string,
  options: FixOptions
): Promise<void> {
  if (options.packageName) {
    console.log(`Generating exports map for package: ${options.packageName}`);
  } else {
    console.log(`Generating exports maps for packages in: ${cwd}`);
  }

  // Read usage data
  const usageContent = await readFile(usageFile, 'utf-8');
  const usageData: UsageData = JSON.parse(usageContent);

  console.log(`Loaded usage data for ${Object.keys(usageData).length} packages`);

  // Find all packages in the current repo
  const packages = await findPackages(cwd);

  // Filter packages if specific package name is provided
  const filteredPackages = options.packageName
    ? packages.filter((pkg) => pkg.name === options.packageName)
    : packages;

  if (options.packageName && filteredPackages.length === 0) {
    throw new Error(`Package '${options.packageName}' not found in the repository`);
  }

  let processedCount = 0;

  for (const pkg of filteredPackages) {
    const usage = usageData[pkg.name];
    if (!usage || usage.importPaths.length === 0) {
      if (options.packageName) {
        console.warn(`Warning: No usage data found for package '${pkg.name}'`);
      }
      continue; // Skip packages without usage data
    }

    // Generate exports map for this package
    const exportsMap = await generateExportsMap(pkg, usage);

    if (options.dryRun) {
      console.log(`\n--- ${pkg.name} ---`);
      console.log(JSON.stringify({ exports: exportsMap }, null, 2));
    } else {
      // Update the package.json with exports
      const wasUpdated = await updatePackageJson(pkg.packageJsonPath, exportsMap);
      if (wasUpdated) {
        console.log(`Updated exports for ${pkg.name}: ${Object.keys(exportsMap).length} entries`);
      } else {
        console.log(`No changes needed for ${pkg.name}: exports are already up to date`);
      }
    }

    processedCount++;
  }

  console.log(`Processed exports for ${processedCount} packages`);
}

/**
 * Updates a package.json file with new exports
 * @param packageJsonPath - Path to package.json file
 * @param exportsMap - Exports map to add
 * @returns Promise resolving to whether changes were made
 */
async function updatePackageJson(
  packageJsonPath: string,
  exportsMap: ExportsMap
): Promise<boolean> {
  const content = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  // Check if exports have actually changed
  const existingExports = packageJson.exports;
  const exportsChanged = JSON.stringify(existingExports) !== JSON.stringify(exportsMap);

  if (!exportsChanged) {
    return false; // No changes needed
  }

  // Add exports map
  packageJson.exports = exportsMap;

  // Write back with proper formatting
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  return true; // Changes were made
}
