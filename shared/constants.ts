/**
 * Shared constants for ADO Review extension.
 *
 * URL patterns, API base URLs, and configuration values.
 */

/** Azure DevOps base URL */
export const ADO_BASE = 'https://dev.azure.com';

/** Azure DevOps REST API version */
export const ADO_API_VERSION = '7.1';

/** Connection data API path -- used for auth testing */
export const CONNECTION_DATA_PATH = '/_apis/connectionData';

/** Expected length of an Azure DevOps Personal Access Token */
export const PAT_LENGTH = 84;

/** File extensions to skip during review (non-code files). */
export const SKIP_EXTENSIONS = new Set([
  '.lock', '.min.js', '.min.css', '.bundle.js', '.map',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.bmp', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.rar',
]);

/** Exact filenames to skip during review. */
export const SKIP_FILENAMES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
  '.DS_Store', 'Thumbs.db',
]);

/** Path patterns to skip during review. */
export const SKIP_PATH_PATTERNS = [
  /node_modules\//,
  /vendor\//,
  /\.generated\//,
  /dist\//,
  /build\//,
  /\.next\//,
];
