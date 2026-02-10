/**
 * Non-code file filtering logic.
 *
 * Identifies files that should be skipped during review based on
 * extension, filename, path pattern, and change type. Prevents
 * wasting LLM tokens on lock files, binaries, images, etc.
 */

import { SKIP_EXTENSIONS, SKIP_FILENAMES, SKIP_PATH_PATTERNS } from '@/shared/constants';

/**
 * Check whether a file should be skipped during review.
 *
 * Matches against:
 * - Exact filenames (e.g., package-lock.json, .DS_Store)
 * - File extensions (e.g., .png, .lock, .map)
 * - Multi-part extensions (e.g., .min.js, .bundle.js)
 * - Path patterns (e.g., node_modules/, dist/)
 *
 * @param filePath - Full file path within the repository
 * @returns true if the file should be skipped
 */
export function shouldSkipFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() ?? '';

  // Check exact filename match
  if (SKIP_FILENAMES.has(fileName)) return true;

  // Check single extension (last .xxx segment)
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex !== -1) {
    const ext = fileName.slice(lastDotIndex).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) return true;
  }

  // Check multi-part extensions (e.g., .min.js, .min.css, .bundle.js)
  // by testing if the filename ends with any skip extension entry
  for (const ext of SKIP_EXTENSIONS) {
    if (fileName.toLowerCase().endsWith(ext)) return true;
  }

  // Check path patterns
  if (SKIP_PATH_PATTERNS.some((pattern) => pattern.test(filePath))) return true;

  return false;
}

/**
 * Check whether a file should be skipped based on its change type.
 *
 * Deleted files have no code to review and are always skipped.
 *
 * @param changeType - The change type string ('add', 'edit', 'delete', 'rename')
 * @returns true if the file should be skipped
 */
export function shouldSkipByChangeType(changeType: string): boolean {
  return changeType === 'delete';
}
