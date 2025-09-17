import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { glob } from 'glob';

export interface PackageInfo {
  name: string;
  path: string;
  packageJsonPath: string;
}

/**
 * Finds all packages in a directory tree
 * @param rootPath - Root directory to search
 * @returns Array of package information
 */
export async function findPackages(rootPath: string): Promise<PackageInfo[]> {
  const packageJsonPaths = await glob('**/package.json', {
    cwd: rootPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  const packages: PackageInfo[] = [];

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

/**
 * Discovers packages in the main repository for targeting specific packages
 * @param mainRepoPath - Path to the main repository
 * @param privateOnly - Whether to only include private packages
 * @returns Set of package names from the main repository
 */
export async function discoverMainRepoPackages(
  mainRepoPath: string,
  privateOnly: boolean = false
): Promise<Set<string>> {
  const packages = new Set<string>();

  const packageJsonPaths = await glob('**/package.json', {
    cwd: mainRepoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  for (const packagePath of packageJsonPaths) {
    const fullPath = join(mainRepoPath, packagePath);
    try {
      const packageJsonContent = await readFile(fullPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.name) {
        // Filter by private flag if requested
        if (!privateOnly || packageJson.private === true) {
          packages.add(packageJson.name);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${packagePath}`);
    }
  }

  return packages;
}
