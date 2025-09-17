import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { existsSync } from 'fs';

export type ModuleType = 'esm' | 'cjs' | 'unknown';

/**
 * Detects the module type of a file based on extension, package.json, and content analysis
 * @param filePath - Path to the file (relative to packageDir)
 * @param packageDir - Directory containing the package
 * @returns Promise resolving to module type
 */
export async function detectModuleType(filePath: string, packageDir: string): Promise<ModuleType> {
  // 1. Check file extension (.mjs = esm, .cjs = cjs)
  const ext = extname(filePath);
  if (ext === '.mjs') return 'esm';
  if (ext === '.cjs') return 'cjs';

  // 2. Check package.json "type" field
  const packageJsonPath = join(packageDir, 'package.json');
  try {
    const packageContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    if (packageJson.type === 'module') return 'esm';
    if (packageJson.type === 'commonjs') return 'cjs';
  } catch {
    // Ignore package.json read errors
  }

  // 3. Static analysis of file content (import/require patterns)
  const fullPath = join(packageDir, filePath.startsWith('./') ? filePath.slice(2) : filePath);
  if (existsSync(fullPath)) {
    try {
      const content = await readFile(fullPath, 'utf-8');
      // Look for ESM patterns
      if (/\b(import|export)\s/.test(content) || /\bimport\s*\(/.test(content)) {
        return 'esm';
      }
      // Look for CommonJS patterns
      if (
        /\brequire\s*\(/.test(content) ||
        /module\.exports\s*=/.test(content) ||
        /exports\s*\./.test(content)
      ) {
        return 'cjs';
      }
    } catch {
      // Ignore file read errors
    }
  }

  // 4. Return 'unknown' if can't determine
  return 'unknown';
}
