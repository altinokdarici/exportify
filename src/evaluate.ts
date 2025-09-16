import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { existsSync } from 'fs';
import type { UsageData, PackageInfo, ExportsMap } from './types.js';

// Pre-compiled regex for performance
const IMPORT_REGEX =
  /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?['"`]([^'"`]+)['"`]|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|import\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/g;

export async function evaluateUsage(
  cwd: string,
  usageFile: string,
  options: { mainRepo?: string; privateOnly?: boolean } = {}
): Promise<void> {
  console.log(`Scanning imports in: ${cwd}`);

  // Discover packages in main repo (defaults to cwd if not specified)
  const mainRepoPath = options.mainRepo || cwd;
  const mainRepoPackages = await discoverMainRepoPackages(mainRepoPath, options.privateOnly);
  console.log(`Found ${mainRepoPackages.size} packages in main repo: ${mainRepoPath}`);


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
  let devDependencies: Record<string, string> = {};

  if (existsSync(packageJsonPath)) {
    try {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      dependencies = packageJson.dependencies || {};
      devDependencies = packageJson.devDependencies || {};
    } catch (error) {
      console.warn('Warning: Could not read package.json for version information');
    }
  }

  // Process files in parallel batches
  const BATCH_SIZE = 50;
  let totalImports = 0;

  for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
    const batch = sourceFiles.slice(i, i + BATCH_SIZE);

    const batchTasks = batch.map(async (sourceFile) => {
      const filePath = join(cwd, sourceFile);
      const imports = await extractImports(filePath);
      return imports;
    });

    const batchResults = await Promise.all(batchTasks);
    const batchImports = batchResults.flat();

    // Process imports and update usage data
    for (const importPath of batchImports) {
      const packageInfo = parseImportPath(importPath, mainRepoPackages);
      if (packageInfo) {
        totalImports++;
        updateUsageData(usageData, packageInfo, dependencies, devDependencies);
      }
    }
  }

  console.log(`Processed ${totalImports} imports from ${sourceFiles.length} files`);

  // Write updated usage data
  await writeFile(usageFile, JSON.stringify(usageData, null, 2));
  console.log(`Updated usage data for ${Object.keys(usageData).length} packages`);
}

async function extractImports(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Early exit: quick check for import keywords
    if (!content.includes('import') && !content.includes('require')) {
      return [];
    }

    // Read only first 50KB for import detection (most imports are at the top)
    const searchContent = content.length > 51200 ? content.substring(0, 51200) : content;

    const imports: string[] = [];
    let match;

    // Reset regex before use
    IMPORT_REGEX.lastIndex = 0;

    // Single pass through content with combined regex
    while ((match = IMPORT_REGEX.exec(searchContent)) !== null) {
      // match[1] = ES6 import, match[2] = require, match[3] = dynamic import
      const importPath = match[1] || match[2] || match[3];
      if (importPath) {
        imports.push(importPath);
      }
    }

    return imports;
  } catch (error) {
    return [];
  }
}

async function discoverMainRepoPackages(mainRepoPath: string, privateOnly: boolean = false): Promise<Map<string, PackageInfo>> {
  const packages = new Map<string, PackageInfo>();

  try {
    const packageJsonPaths = await glob('**/package.json', {
      cwd: mainRepoPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    });

    for (const packagePath of packageJsonPaths) {
      const fullPath = join(mainRepoPath, packagePath);
      try {
        const packageJsonContent = await readFile(fullPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        if (packageJson.name && (!privateOnly || packageJson.private === true)) {
          packages.set(packageJson.name, {
            name: packageJson.name,
            exports: packageJson.exports || undefined,
          });
        }
      } catch (error) {
        // Skip invalid package.json files
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not scan main repo at ${mainRepoPath}`);
  }

  return packages;
}

function parseImportPath(
  importPath: string,
  mainRepoPackages?: Map<string, PackageInfo> | null
): { packageName: string; importPath: string } | null {
  // Skip relative imports
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return null;
  }

  // Skip built-in Node.js modules
  if (
    importPath.startsWith('node:') ||
    ['fs', 'path', 'url', 'util', 'crypto', 'http', 'https', 'stream'].includes(importPath)
  ) {
    return null;
  }

  let packageName: string;

  // Handle scoped packages (@scope/package/path)
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      packageName = `${parts[0]}/${parts[1]}`;
    } else {
      return null;
    }
  } else {
    // Handle regular packages (package/path)
    const parts = importPath.split('/');
    packageName = parts[0];
  }

  // If main repo packages are specified, only track those packages
  if (mainRepoPackages && !mainRepoPackages.has(packageName)) {
    return null;
  }

  // Convert to import path relative to package root
  const importRelativePath =
    importPath === packageName ? '.' : `./${importPath.slice(packageName.length + 1)}`;

  // Check if this import path is already covered by existing exports
  if (mainRepoPackages) {
    const packageInfo = mainRepoPackages.get(packageName);
    if (packageInfo?.exports && isImportCoveredByExports(importRelativePath, packageInfo.exports)) {
      return null; // Skip imports already covered by existing exports
    }
  }

  return {
    packageName,
    importPath: importRelativePath,
  };
}

function updateUsageData(
  usageData: UsageData,
  packageInfo: { packageName: string; importPath: string },
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>
): void {
  const { packageName, importPath } = packageInfo;

  // Get version requirement from dependencies
  const versionRequirement = dependencies[packageName] || devDependencies[packageName];

  // Initialize or update package usage
  if (!usageData[packageName]) {
    usageData[packageName] = {
      package: packageName,
      versionRequirement,
      importPaths: [],
    };
  }

  // Update version requirement if we found one
  if (versionRequirement && !usageData[packageName].versionRequirement) {
    usageData[packageName].versionRequirement = versionRequirement;
  }

  // Add import path if not already present
  if (!usageData[packageName].importPaths.includes(importPath)) {
    usageData[packageName].importPaths.push(importPath);
  }

  // Sort import paths for consistency
  usageData[packageName].importPaths.sort();
}

function isImportCoveredByExports(importPath: string, exports: ExportsMap): boolean {
  // Check if the exact import path exists in exports
  if (exports[importPath]) {
    return true;
  }

  // Check for wildcard patterns (e.g., "./*": "./lib/*.js")
  for (const exportKey of Object.keys(exports)) {
    if (exportKey.endsWith('/*')) {
      const prefix = exportKey.slice(0, -2); // Remove the /*
      if (importPath.startsWith(prefix) && importPath !== prefix) {
        return true;
      }
    }
  }

  return false;
}
