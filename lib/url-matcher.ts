/**
 * Azure DevOps PR URL parsing and matching utilities.
 *
 * Handles URL patterns like:
 *   https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
 *
 * URL-encoded segments are decoded before returning.
 */

import type { PrInfo } from '@/shared/types';

/**
 * Regex for matching Azure DevOps pull request URLs.
 *
 * Captures: org, project, repo, prId
 * Handles URL-encoded segments via decodeURIComponent after match.
 */
const PR_URL_REGEX =
  /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/;

/**
 * Parse an Azure DevOps PR URL into its components.
 *
 * @param url - Full URL to parse
 * @returns Parsed PrInfo or null if the URL is not a valid PR URL
 *
 * @example
 * ```ts
 * const info = parsePrUrl('https://dev.azure.com/MyOrg/MyProject/_git/my-repo/pullrequest/123');
 * // { org: 'MyOrg', project: 'MyProject', repo: 'my-repo', prId: 123, baseUrl: 'https://dev.azure.com/MyOrg/MyProject' }
 * ```
 */
export function parsePrUrl(url: string): PrInfo | null {
  const match = url.match(PR_URL_REGEX);
  if (!match) return null;

  const [, rawOrg, rawProject, rawRepo, prIdStr] = match;
  const prId = parseInt(prIdStr, 10);
  if (isNaN(prId)) return null;

  const org = decodeURIComponent(rawOrg);
  const project = decodeURIComponent(rawProject);
  const repo = decodeURIComponent(rawRepo);

  return {
    org,
    project,
    repo,
    prId,
    baseUrl: `https://dev.azure.com/${org}/${project}`,
  };
}

/**
 * Check whether a URL is an Azure DevOps pull request URL.
 *
 * @param url - URL to test
 * @returns true if the URL matches the PR URL pattern
 */
export function isPullRequestUrl(url: string): boolean {
  return PR_URL_REGEX.test(url);
}

/**
 * Build an Azure DevOps REST API URL for a given PR context.
 *
 * @param prInfo - Parsed PR info (org, project, etc.)
 * @param path - API path segment (e.g., 'git/repositories/{repoId}/pullRequests/{prId}')
 * @returns Full API URL
 *
 * @example
 * ```ts
 * buildApiUrl(prInfo, 'git/repositories/my-repo/pullRequests/123/threads');
 * // 'https://dev.azure.com/MyOrg/MyProject/_apis/git/repositories/my-repo/pullRequests/123/threads'
 * ```
 */
export function buildApiUrl(prInfo: PrInfo, path: string): string {
  return `${prInfo.baseUrl}/_apis/${path}`;
}
