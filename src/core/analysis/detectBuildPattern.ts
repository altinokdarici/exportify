import { normalizeRelativePath } from '../../utils/normalizeRelativePath.js';

export interface PathPattern {
  basePath: string;
  identifier: string; // 'cjs', 'esm', '.cjs', '.mjs', etc.
}

export interface BuildPattern {
  hasMultipleBuilds: boolean;
  cjsPattern?: PathPattern;
  esmPattern?: PathPattern;
  patternType: 'directory' | 'extension' | 'prefix' | 'none';
}

/**
 * Detects the build pattern between main and module fields
 * @param mainField - The main field from package.json
 * @param moduleField - The module field from package.json
 * @returns BuildPattern information about the build structure
 */
export function detectBuildPattern(mainField?: string, moduleField?: string): BuildPattern {
  // If either field is missing, no pattern can be detected
  if (!mainField || !moduleField) {
    return {
      hasMultipleBuilds: false,
      patternType: 'none',
    };
  }

  const normalizedMain = normalizeRelativePath(mainField);
  const normalizedModule = normalizeRelativePath(moduleField);

  // If paths are identical, no pattern
  if (normalizedMain === normalizedModule) {
    return {
      hasMultipleBuilds: false,
      patternType: 'none',
    };
  }

  // Try to detect directory-based pattern (e.g., lib/cjs vs lib/esm)
  const directoryPattern = detectDirectoryPattern(normalizedMain, normalizedModule);
  if (directoryPattern.hasMultipleBuilds) {
    return directoryPattern;
  }

  // Try to detect extension-based pattern (e.g., .cjs vs .mjs)
  const extensionPattern = detectExtensionPattern(normalizedMain, normalizedModule);
  if (extensionPattern.hasMultipleBuilds) {
    return extensionPattern;
  }

  // Try to detect prefix-based pattern (e.g., cjs.index.js vs esm.index.js)
  const prefixPattern = detectPrefixPattern(normalizedMain, normalizedModule);
  if (prefixPattern.hasMultipleBuilds) {
    return prefixPattern;
  }

  // If no pattern detected, but paths differ
  return {
    hasMultipleBuilds: false,
    patternType: 'none',
  };
}

/**
 * Detects directory-based patterns like lib/cjs/index.js vs lib/esm/index.js
 */
function detectDirectoryPattern(mainPath: string, modulePath: string): BuildPattern {
  const mainParts = mainPath.split('/');
  const moduleParts = modulePath.split('/');

  // Must have same depth
  if (mainParts.length !== moduleParts.length) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Check if filenames are compatible (same base name, potentially different extensions)
  const mainFilename = mainParts[mainParts.length - 1];
  const moduleFilename = moduleParts[moduleParts.length - 1];

  if (!areFilenamesCompatible(mainFilename, moduleFilename)) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Find the differing directory
  let differIndex = -1;
  for (let i = 0; i < mainParts.length - 1; i++) {
    if (mainParts[i] !== moduleParts[i]) {
      if (differIndex === -1) {
        differIndex = i;
      } else {
        // Multiple differences - too complex
        return { hasMultipleBuilds: false, patternType: 'none' };
      }
    }
  }

  if (differIndex === -1) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  const mainDir = mainParts[differIndex];
  const moduleDir = moduleParts[differIndex];

  // Check if these look like CJS/ESM directories
  if (isCjsIdentifier(mainDir) && isEsmIdentifier(moduleDir)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'directory',
      cjsPattern: {
        basePath: mainParts.slice(0, differIndex).join('/'),
        identifier: mainDir,
      },
      esmPattern: {
        basePath: moduleParts.slice(0, differIndex).join('/'),
        identifier: moduleDir,
      },
    };
  }

  if (isCjsIdentifier(moduleDir) && isEsmIdentifier(mainDir)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'directory',
      cjsPattern: {
        basePath: moduleParts.slice(0, differIndex).join('/'),
        identifier: moduleDir,
      },
      esmPattern: {
        basePath: mainParts.slice(0, differIndex).join('/'),
        identifier: mainDir,
      },
    };
  }

  return { hasMultipleBuilds: false, patternType: 'none' };
}

/**
 * Detects extension-based patterns like index.cjs vs index.mjs
 */
function detectExtensionPattern(mainPath: string, modulePath: string): BuildPattern {
  const mainExt = getFileExtension(mainPath);
  const moduleExt = getFileExtension(modulePath);

  // Check if paths are identical except for extension
  const mainWithoutExt = mainPath.slice(0, mainPath.lastIndexOf('.'));
  const moduleWithoutExt = modulePath.slice(0, modulePath.lastIndexOf('.'));

  if (mainWithoutExt !== moduleWithoutExt) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Check if extensions indicate CJS/ESM
  if (isCjsExtension(mainExt) && isEsmExtension(moduleExt)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'extension',
      cjsPattern: {
        basePath: mainWithoutExt,
        identifier: mainExt,
      },
      esmPattern: {
        basePath: moduleWithoutExt,
        identifier: moduleExt,
      },
    };
  }

  if (isCjsExtension(moduleExt) && isEsmExtension(mainExt)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'extension',
      cjsPattern: {
        basePath: moduleWithoutExt,
        identifier: moduleExt,
      },
      esmPattern: {
        basePath: mainWithoutExt,
        identifier: mainExt,
      },
    };
  }

  return { hasMultipleBuilds: false, patternType: 'none' };
}

/**
 * Detects prefix-based patterns like cjs.index.js vs esm.index.js
 */
function detectPrefixPattern(mainPath: string, modulePath: string): BuildPattern {
  const mainParts = mainPath.split('/');
  const moduleParts = modulePath.split('/');

  if (mainParts.length !== moduleParts.length) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Check if only the filename differs by prefix
  const lastIndex = mainParts.length - 1;
  const mainFilename = mainParts[lastIndex];
  const moduleFilename = moduleParts[lastIndex];

  // Check if directory parts are identical
  for (let i = 0; i < lastIndex; i++) {
    if (mainParts[i] !== moduleParts[i]) {
      return { hasMultipleBuilds: false, patternType: 'none' };
    }
  }

  // Extract potential prefixes
  const mainPrefix = extractPrefix(mainFilename);
  const modulePrefix = extractPrefix(moduleFilename);

  if (!mainPrefix || !modulePrefix) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Check if remainder after prefix is identical
  const mainRemainder = mainFilename.slice(mainPrefix.length + 1); // +1 for separator
  const moduleRemainder = moduleFilename.slice(modulePrefix.length + 1);

  if (mainRemainder !== moduleRemainder) {
    return { hasMultipleBuilds: false, patternType: 'none' };
  }

  // Check if prefixes indicate CJS/ESM
  if (isCjsIdentifier(mainPrefix) && isEsmIdentifier(modulePrefix)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'prefix',
      cjsPattern: {
        basePath: mainParts.slice(0, lastIndex).join('/'),
        identifier: mainPrefix,
      },
      esmPattern: {
        basePath: moduleParts.slice(0, lastIndex).join('/'),
        identifier: modulePrefix,
      },
    };
  }

  if (isCjsIdentifier(modulePrefix) && isEsmIdentifier(mainPrefix)) {
    return {
      hasMultipleBuilds: true,
      patternType: 'prefix',
      cjsPattern: {
        basePath: moduleParts.slice(0, lastIndex).join('/'),
        identifier: modulePrefix,
      },
      esmPattern: {
        basePath: mainParts.slice(0, lastIndex).join('/'),
        identifier: mainPrefix,
      },
    };
  }

  return { hasMultipleBuilds: false, patternType: 'none' };
}

/**
 * Helper functions for identifying CJS/ESM patterns
 */
function isCjsIdentifier(str: string): boolean {
  return /^(cjs|commonjs|common|node)$/i.test(str);
}

function isEsmIdentifier(str: string): boolean {
  return /^(esm|es|module|modules|import)$/i.test(str);
}

function isCjsExtension(ext: string): boolean {
  return ext === '.cjs' || ext === '.js'; // .js can be CJS depending on context
}

function isEsmExtension(ext: string): boolean {
  return ext === '.mjs' || ext === '.js'; // .js can be ESM depending on context
}

function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? '' : path.slice(lastDot);
}

function extractPrefix(filename: string): string | null {
  // Look for patterns like "cjs.index.js" or "esm-index.js"
  const match = filename.match(/^([a-z]+)[.-]/i);
  return match ? match[1] : null;
}

function areFilenamesCompatible(filename1: string, filename2: string): boolean {
  // Exact match
  if (filename1 === filename2) {
    return true;
  }

  // Check if they have the same base name but different extensions
  const baseName1 = filename1.replace(/\.[^.]*$/, '');
  const baseName2 = filename2.replace(/\.[^.]*$/, '');

  return baseName1 === baseName2;
}
