import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { existsSync } from 'fs';
import type { UsageData } from '../types.js';
import { discoverMainRepoPackages } from '../core/packages/findPackages.js';
import {
  analyzeFileImports,
  extractVersionRequirement,
} from '../core/analysis/analyzeFileImports.js';

export interface EvaluateOptions {
  mainRepo?: string;
  privateOnly?: boolean;
}

/**
 * Evaluates package usage in a repository
 * @param cwd - Working directory to scan
 * @param usageFile - Path to usage.json file to create/update
 * @param options - Evaluation options
 */
export async function evaluateUsage(
  cwd: string,
  usageFile: string,
  options: EvaluateOptions = {}
): Promise<void> {
  console.log(`Scanning imports in: ${cwd}`);

  // Always discover packages in the current scanning directory
  const currentRepoPackages = await discoverMainRepoPackages(cwd, options.privateOnly);

  // Determine which packages to track based on mode
  let targetPackages: Set<string>;
  if (options.mainRepo) {
    // Cross-repo mode: only track imports to packages from the main repo
    targetPackages = await discoverMainRepoPackages(options.mainRepo, options.privateOnly);
    console.log(
      `Cross-repo mode: tracking ${targetPackages.size} main-repo packages from ${options.mainRepo}`
    );
  } else {
    // Single-repo mode: only track internal packages (packages that exist in current repo)
    targetPackages = currentRepoPackages;
    console.log(`Single-repo mode: tracking ${targetPackages.size} internal packages`);
  }

  // Load existing usage data if it exists
  let usageData: UsageData = {};
  if (existsSync(usageFile)) {
    try {
      const existingContent = await readFile(usageFile, 'utf-8');
      usageData = JSON.parse(existingContent);
      console.log(`Loaded existing usage data with ${Object.keys(usageData).length} packages`);
    } catch (error) {
      console.warn(`Warning: Could not read existing usage file, starting fresh`);
    }
  }

  // Find all source files
  const sourceFiles = await glob('**/*.{ts,tsx,js,jsx,mts,cts,cjs,mjs}', {
    cwd,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/lib/**', '**/*.d.ts'],
  });

  console.log(`Found ${sourceFiles.length} source files to analyze`);

  // Find package.json for version information
  const packageJsonPath = join(cwd, 'package.json');
  let dependencies: Record<string, string> = {};

  if (existsSync(packageJsonPath)) {
    try {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      };
    } catch (error) {
      console.warn(`Warning: Could not read package.json for version information`);
    }
  }

  // Process each source file
  for (const sourceFile of sourceFiles) {
    const filePath = join(cwd, sourceFile);
    const imports = await analyzeFileImports(filePath, targetPackages);

    for (const { packageName, importPath } of imports) {
      // Initialize package usage if it doesn't exist
      if (!usageData[packageName]) {
        usageData[packageName] = {
          package: packageName,
          importPaths: [],
        };
      }

      const packageUsage = usageData[packageName];

      // Add import path if not already present
      if (!packageUsage.importPaths.includes(importPath)) {
        packageUsage.importPaths.push(importPath);
      }

      // Update version requirement if available and not already set
      if (!packageUsage.versionRequirement) {
        const versionReq = extractVersionRequirement(packageName, dependencies);
        if (versionReq) {
          packageUsage.versionRequirement = versionReq;
        }
      }
    }
  }

  // Sort import paths for consistent output
  for (const packageUsage of Object.values(usageData)) {
    packageUsage.importPaths.sort();
  }

  // Write updated usage data
  await writeFile(usageFile, JSON.stringify(usageData, null, 2));
  console.log(`Updated usage data with ${Object.keys(usageData).length} packages`);
}
