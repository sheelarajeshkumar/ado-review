/**
 * Authenticated fetch wrapper for Azure DevOps REST API.
 *
 * All ADO API calls should go through adoFetch to ensure consistent
 * auth header injection, API version management, and error handling.
 */

import { getAuthHeaders } from '@/lib/auth/manager';
import { ADO_API_VERSION } from '@/shared/constants';

/**
 * Error thrown when an ADO API call returns a non-ok response.
 */
export class AdoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly url: string,
  ) {
    super(`ADO API error ${status} for ${url}: ${body.slice(0, 200)}`);
    this.name = 'AdoApiError';
  }
}

/**
 * Extract the organization URL from a full ADO API URL.
 *
 * @param url - Full API URL (e.g., https://dev.azure.com/MyOrg/MyProject/_apis/...)
 * @returns Organization URL (e.g., https://dev.azure.com/MyOrg)
 */
function extractOrgUrl(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  // URL is https://dev.azure.com/{org}/... -- org is the first segment
  return `${parsed.origin}/${segments[0]}`;
}

/**
 * Make an authenticated request to the Azure DevOps REST API.
 *
 * Handles:
 * - Auth header injection via getAuthHeaders
 * - API version query parameter
 * - Session credential inclusion
 * - Error response wrapping
 *
 * @param url - Full API URL
 * @param options - Optional fetch RequestInit overrides
 * @returns The fetch Response
 * @throws AdoApiError on non-ok responses
 */
export async function adoFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const auth = await getAuthHeaders(extractOrgUrl(url));
  if (!auth) {
    throw new Error('Not authenticated with Azure DevOps');
  }

  const headers = new Headers(options?.headers);
  headers.set('Accept', 'application/json');

  // Merge auth headers
  for (const [key, value] of Object.entries(auth.headers)) {
    headers.set(key, value);
  }

  // Add API version if not already in URL
  const urlObj = new URL(url);
  if (!urlObj.searchParams.has('api-version')) {
    urlObj.searchParams.set('api-version', ADO_API_VERSION);
  }

  const response = await fetch(urlObj.toString(), {
    ...options,
    credentials: auth.method === 'session' ? 'include' : undefined,
    headers,
  });

  if (!response.ok) {
    throw new AdoApiError(response.status, await response.text(), url);
  }

  return response;
}
