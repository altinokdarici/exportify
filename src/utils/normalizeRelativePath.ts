/**
 * Normalizes a path to ensure it starts with "./"
 * @param path - The path to normalize
 * @returns Normalized path with "./" prefix
 */
export function normalizeRelativePath(path: string): string {
  return path.startsWith('./') ? path : `./${path}`;
}
