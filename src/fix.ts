import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { glob } from 'glob';
import { existsSync } from 'fs';
import type { UsageData, FixOptions, ExportsMap } from './types.js';

export async function fixExports(
  cwd: string,
  usageFile: string,
  options: FixOptions
): Promise<void> {
  console.log(`Generating exports maps for packages in: ${cwd}`);

  // Read usage data
  const usageContent = await readFile(usageFile, 'utf-8');
  const usageData: UsageData = JSON.parse(usageContent);

  console.log(`Loaded usage data for ${Object.keys(usageData).length} packages`);

  // Find all packages in the current repo
  const packages = await findPackages(cwd);

  let processedCount = 0;

  for (const pkg of packages) {
    const usage = usageData[pkg.name];
    if (!usage || usage.importPaths.length === 0) {
      continue; // Skip packages without usage data
    }

    // Only process packages that have deep imports (more than just root import)
    const hasDeepImports = usage.importPaths.some((path) => path !== '.');
    if (!hasDeepImports) {
      continue; // Skip packages with only root imports
    }

    // Generate exports map for this package
    const exportsMap = await generateExportsMap(pkg, usage);

    if (options.dryRun) {
      console.log(`\n--- ${pkg.name} ---`);
      console.log(JSON.stringify({ exports: exportsMap }, null, 2));
    } else {
      // Update the package.json with exports
      await updatePackageJson(pkg.packageJsonPath, exportsMap);
      console.log(`Updated exports for ${pkg.name}: ${Object.keys(exportsMap).length} entries`);
    }

    processedCount++;
  }

  console.log(`Processed exports for ${processedCount} packages`);
}

async function findPackages(
  rootPath: string
): Promise<Array<{ name: string; path: string; packageJsonPath: string }>> {
  const packageJsonPaths = await glob('**/package.json', {
    cwd: rootPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const packages = [];

  for (const packagePath of packageJsonPaths) {
    const fullPath = join(rootPath, packagePath);
    try {
      const packageJsonContent = await readFile(fullPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.name) {
        packages.push({
          name: packageJson.name,
          path: dirname(fullPath),
          packageJsonPath: fullPath,
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${packagePath}`);
    }
  }

  return packages;
}

async function generateExportsMap(
  pkg: { name: string; path: string; packageJsonPath: string },
  usage: { importPaths: string[] }
): Promise<ExportsMap> {
  // Read the package.json to get baseline exports
  const packageJsonContent = await readFile(pkg.packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);

  const exportsMap: ExportsMap = {};

  // Generate baseline exports from package.json fields
  generateBaselineExports(exportsMap, packageJson);

  // Add exports for usage-based import paths
  for (const importPath of usage.importPaths) {
    if (importPath === '.') {
      continue; // Already handled by baseline
    }

    const exportEntry = await generateExportEntry(importPath, pkg.path);
    if (exportEntry) {
      exportsMap[importPath] = exportEntry;
    }
  }

  return exportsMap;
}

function generateBaselineExports(
  exportsMap: ExportsMap,
  packageJson: Record<string, unknown>
): void {
  const rootExport: Record<string, string> = {};

  // Handle main field (typically CommonJS)
  if (packageJson.main && typeof packageJson.main === 'string') {
    const mainPath = packageJson.main.startsWith('./') ? packageJson.main : `./${packageJson.main}`;
    rootExport.default = mainPath;
    // If no module field, assume main is also for require
    if (!packageJson.module) {
      rootExport.require = mainPath;
    }
  }

  // Handle module field (ESM)
  if (packageJson.module && typeof packageJson.module === 'string') {
    const modulePath = packageJson.module.startsWith('./')
      ? packageJson.module
      : `./${packageJson.module}`;
    rootExport.import = modulePath;
  }

  // Handle types field
  if ((packageJson.types || packageJson.typings) && typeof (packageJson.types || packageJson.typings) === 'string') {
    const typesPath = (packageJson.types || packageJson.typings) as string;
    rootExport.types = typesPath.startsWith('./') ? typesPath : `./${typesPath}`;
  }

  // Handle browser field (simplified - only string values for now)
  if (typeof packageJson.browser === 'string') {
    const browserPath = packageJson.browser.startsWith('./')
      ? packageJson.browser
      : `./${packageJson.browser}`;
    rootExport.browser = browserPath;
  }

  // Set the root export
  if (Object.keys(rootExport).length > 0) {
    exportsMap['.'] =
      Object.keys(rootExport).length === 1 ? (Object.values(rootExport)[0] as string) : rootExport;
  } else {
    // Fallback defaults
    exportsMap['.'] = './lib/index.js';
  }
}

async function generateExportEntry(
  importPath: string,
  packagePath: string
): Promise<string | object | null> {
  // Remove leading './' if present
  const cleanPath = importPath.startsWith('./') ? importPath.slice(2) : importPath;

  // Try to detect the actual file structure
  const possibleExtensions = ['', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
  const possibleBases = ['lib', 'dist', 'src'];

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

    // Check for TypeScript types
    const typesPath = join(packagePath, buildDir, foundFile.replace(/\.(js|mjs|cjs)$/, '.d.ts'));
    if (existsSync(typesPath)) {
      exportEntry.types = `./${buildDir}/${foundFile.replace(/\.(js|mjs|cjs)$/, '.d.ts')}`;
    }

    // Add the main export
    const jsPath = `./${buildDir}/${foundFile.replace(/\.ts$/, '.js')}`;
    exportEntry.default = jsPath;

    // For TypeScript files, assume they'll be compiled to JS
    if (foundFile.endsWith('.ts') || foundFile.endsWith('.tsx')) {
      exportEntry.import = jsPath;
    }

    return Object.keys(exportEntry).length === 1 ? exportEntry.default : exportEntry;
  }

  // If no file found, try to infer from src -> lib mapping
  const srcPath = join(packagePath, 'src', `${cleanPath}.ts`);
  const srcIndexPath = join(packagePath, 'src', cleanPath, 'index.ts');

  if (existsSync(srcPath) || existsSync(srcIndexPath)) {
    const baseName = existsSync(srcPath) ? cleanPath : `${cleanPath}/index`;
    return {
      types: `./lib/${baseName}.d.ts`,
      import: `./lib/${baseName}.js`,
      default: `./lib/${baseName}.js`,
    };
  }

  // Fallback: assume it will exist in lib directory
  console.warn(
    `Warning: Could not find file for import path "${importPath}" in package at ${packagePath}`
  );
  return {
    types: `./lib/${cleanPath}.d.ts`,
    default: `./lib/${cleanPath}.js`,
  };
}

async function updatePackageJson(packageJsonPath: string, exportsMap: ExportsMap): Promise<void> {
  const content = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  // Add exports map
  packageJson.exports = exportsMap;

  // Write back with proper formatting
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}
