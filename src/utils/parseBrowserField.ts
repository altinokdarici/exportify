import { normalizeRelativePath } from './normalizeRelativePath.js';

export interface BrowserFieldResult {
  rootBrowser?: string;
  browserMappings: Record<string, string | false>;
}

/**
 * Parses browser field from package.json according to spec
 * @param browserField - String or object browser field value
 * @param mainField - Optional main field value for root mapping detection
 * @param moduleField - Optional module field value for root mapping detection
 * @returns Parsed browser field with root browser and mappings
 */
export function parseBrowserField(
  browserField: string | Record<string, string | false>,
  mainField?: string,
  moduleField?: string
): BrowserFieldResult {
  if (typeof browserField === 'string') {
    return {
      rootBrowser: normalizeRelativePath(browserField),
      browserMappings: {},
    };
  }

  const browserMappings: Record<string, string | false> = {};
  let rootBrowser: string | undefined;

  // Normalize main and module fields for comparison
  const normalizedMain = mainField ? normalizeRelativePath(mainField) : null;
  const normalizedModule = moduleField ? normalizeRelativePath(moduleField) : null;

  for (const [key, value] of Object.entries(browserField)) {
    const normalizedKey = normalizeRelativePath(key);

    // Check if this key matches main field (priority) or module field
    if (normalizedMain && normalizedKey === normalizedMain) {
      // Main field takes priority - maps to root export with browser condition
      if (value !== false) {
        rootBrowser = normalizeRelativePath(value);
      }
      // Don't add to browserMappings since this goes to root export
    } else if (normalizedModule && normalizedKey === normalizedModule) {
      // Module field mapping (only if main didn't already set rootBrowser)
      if (value !== false && !rootBrowser) {
        rootBrowser = normalizeRelativePath(value);
      } else if (rootBrowser) {
        // Main already set rootBrowser, so treat this module mapping as separate export
        browserMappings[normalizedKey] = value === false ? false : normalizeRelativePath(value);
      }
      // Don't add to browserMappings if this is the first/only module match
    } else {
      // This is a separate export entry
      browserMappings[normalizedKey] = value === false ? false : normalizeRelativePath(value);
    }
  }

  return { rootBrowser, browserMappings };
}
