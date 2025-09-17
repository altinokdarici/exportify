import type { ExportsMap } from '../../types.js';
import { detectModuleType } from '../analysis/detectModuleType.js';
import { parseBrowserField } from '../../utils/parseBrowserField.js';
import { normalizeRelativePath } from '../../utils/normalizeRelativePath.js';
import { findSourceFile, findSourceFromPackageJson } from '../../utils/findSourceFile.js';

type ExportConditions = Record<string, string>;

/**
 * Generates baseline exports from package.json fields (main, module, browser, types)
 * @param packageJson - Package.json content
 * @param packageDir - Directory containing the package
 * @returns Promise resolving to exports map
 */
export async function generateBaselineExports(
  packageJson: Record<string, unknown>,
  packageDir: string
): Promise<ExportsMap> {
  const exportsMap: ExportsMap = {};
  const rootExport: ExportConditions = {};

  // Check for source field in package.json first
  const packageJsonSource = findSourceFromPackageJson(packageJson, packageDir);
  if (packageJsonSource) {
    rootExport.source = packageJsonSource;
  }

  // Handle types field first (should come first in exports)
  if (
    (packageJson.types || packageJson.typings) &&
    typeof (packageJson.types || packageJson.typings) === 'string'
  ) {
    const typesPath = (packageJson.types || packageJson.typings) as string;
    rootExport.types = normalizeRelativePath(typesPath);
  }

  // Handle main field with module type detection
  if (packageJson.main && typeof packageJson.main === 'string') {
    const mainPath = normalizeRelativePath(packageJson.main);
    const moduleType = await detectModuleType(mainPath, packageDir);

    rootExport.default = mainPath;

    // Set require condition if it's CommonJS or unknown (default to CommonJS)
    if (moduleType === 'cjs' || moduleType === 'unknown') {
      rootExport.require = mainPath;
    }

    // Try to find source file for main field if not already set
    if (!rootExport.source) {
      const sourceFile = findSourceFile(mainPath, packageDir);
      if (sourceFile) {
        rootExport.source = sourceFile;
      }
    }
  }

  // Handle module field (always ESM)
  if (packageJson.module && typeof packageJson.module === 'string') {
    const modulePath = normalizeRelativePath(packageJson.module);
    rootExport.import = modulePath;

    // Try to find source file for module field if not already set
    if (!rootExport.source) {
      const sourceFile = findSourceFile(modulePath, packageDir);
      if (sourceFile) {
        rootExport.source = sourceFile;
      }
    }
  }

  // Handle browser field with complex logic
  if (
    packageJson.browser &&
    (typeof packageJson.browser === 'string' || typeof packageJson.browser === 'object')
  ) {
    const { rootBrowser, browserMappings } = parseBrowserField(
      packageJson.browser as string | Record<string, string | false>,
      packageJson.main as string | undefined,
      packageJson.module as string | undefined
    );

    if (rootBrowser) {
      // Browser field maps to root export (either string field or main/module match)
      rootExport.browser = rootBrowser;
    }

    // Object browser field - process separate export mappings
    for (const [key, value] of Object.entries(browserMappings)) {
      if (value === false) {
        // Handle blocked browser entries - create export with no browser condition
        // This effectively blocks the module in browser environments
        const exportEntry: ExportConditions = {};

        // Try to find source file for this export
        const sourceFile = findSourceFile(key, packageDir);
        if (sourceFile) {
          exportEntry.source = sourceFile;
        }

        exportEntry.default = key;
        // Note: no browser condition means it's blocked in browser

        exportsMap[key] = exportEntry;
      } else {
        // Create separate export entry with browser condition
        const exportEntry: ExportConditions = {};

        // Try to find source file for this export
        const sourceFile = findSourceFile(key, packageDir);
        if (sourceFile) {
          exportEntry.source = sourceFile;
        }

        exportEntry.browser = value;
        exportEntry.default = key;

        exportsMap[key] = exportEntry;
      }
    }
  }

  // Set the root export if we have any conditions
  if (Object.keys(rootExport).length > 0) {
    // Order conditions properly: source, types, import, require, browser, default
    const orderedExport: ExportConditions = {};
    if (rootExport.source) orderedExport.source = rootExport.source;
    if (rootExport.types) orderedExport.types = rootExport.types;
    if (rootExport.import) orderedExport.import = rootExport.import;
    if (rootExport.require) orderedExport.require = rootExport.require;
    if (rootExport.browser) orderedExport.browser = rootExport.browser;
    if (rootExport.default) orderedExport.default = rootExport.default;

    exportsMap['.'] =
      Object.keys(orderedExport).length === 1 ? Object.values(orderedExport)[0] : orderedExport;
  } else {
    // Fallback defaults
    exportsMap['.'] = './lib/index.js';
  }

  return exportsMap;
}
