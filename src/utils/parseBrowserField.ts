import { normalizeRelativePath } from './normalizeRelativePath.js';

export interface BrowserFieldResult {
  rootBrowser?: string;
  browserMappings: Record<string, string | false>;
}

/**
 * Parses browser field from package.json according to spec
 * @param browserField - String or object browser field value
 * @returns Parsed browser field with root browser and mappings
 */
export function parseBrowserField(
  browserField: string | Record<string, string | false>
): BrowserFieldResult {
  if (typeof browserField === 'string') {
    return {
      rootBrowser: normalizeRelativePath(browserField),
      browserMappings: {},
    };
  }

  const browserMappings: Record<string, string | false> = {};
  let rootBrowser: string | undefined;

  for (const [key, value] of Object.entries(browserField)) {
    const normalizedKey = normalizeRelativePath(key);
    browserMappings[normalizedKey] = value === false ? false : normalizeRelativePath(value);
  }

  return { rootBrowser, browserMappings };
}
