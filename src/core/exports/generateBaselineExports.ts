import type { ExportsMap } from '../../types.js';
import { detectModuleType } from '../analysis/detectModuleType.js';
import { parseBrowserField } from '../../utils/parseBrowserField.js';
import { normalizeRelativePath } from '../../utils/normalizeRelativePath.js';

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
  }

  // Handle module field (always ESM)
  if (packageJson.module && typeof packageJson.module === 'string') {
    const modulePath = normalizeRelativePath(packageJson.module);
    rootExport.import = modulePath;
  }

  // Handle browser field with complex logic
  if (
    packageJson.browser &&
    (typeof packageJson.browser === 'string' || typeof packageJson.browser === 'object')
  ) {
    const { rootBrowser, browserMappings } = parseBrowserField(
      packageJson.browser as string | Record<string, string | false>
    );

    if (rootBrowser) {
      // String browser field maps to root export
      rootExport.browser = rootBrowser;
    } else {
      // Object browser field - process mappings
      for (const [key, value] of Object.entries(browserMappings)) {
        if (value === false) {
          // Handle blocked browser entries - could add a special condition
          continue;
        }

        // Check if key matches main or module field
        const mainPath = packageJson.main
          ? normalizeRelativePath(packageJson.main as string)
          : null;
        const modulePath = packageJson.module
          ? normalizeRelativePath(packageJson.module as string)
          : null;

        if (key === mainPath || key === modulePath) {
          // Maps to root export with browser condition
          rootExport.browser = value;
        } else {
          // Treat as separate export entry
          exportsMap[key] = {
            browser: value,
            default: key,
          };
        }
      }
    }
  }

  // Set the root export if we have any conditions
  if (Object.keys(rootExport).length > 0) {
    // Order conditions properly: types, import, require, browser, default
    const orderedExport: ExportConditions = {};
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
