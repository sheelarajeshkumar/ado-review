/**
 * Session cookie authentication for Azure DevOps.
 *
 * Uses the browser's existing Azure DevOps session cookies to authenticate
 * API requests from the service worker. Requires `credentials: 'include'`
 * on every fetch call -- cookies are NOT sent automatically from service
 * workers even with host_permissions.
 */

import { CONNECTION_DATA_PATH } from '@/shared/constants';

/**
 * Test if the user's browser session can authenticate with Azure DevOps.
 *
 * Makes a GET request to the connectionData endpoint with credentials included.
 * Returns true if the response is OK (user is logged in), false otherwise.
 *
 * @param orgUrl - The Azure DevOps organization URL (e.g., https://dev.azure.com/myorg)
 * @returns true if session auth works, false otherwise
 */
export async function testSessionAuth(orgUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${orgUrl}${CONNECTION_DATA_PATH}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Make an authenticated fetch to Azure DevOps using session cookies.
 *
 * Wraps fetch with `credentials: 'include'` always set and merges
 * `Accept: application/json` into headers. This is the function all
 * Azure DevOps API calls should use when session-authenticated.
 *
 * @param url - The full URL to fetch
 * @param options - Optional fetch options (credentials and Accept are always set)
 * @returns The fetch Response
 */
export async function sessionFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}
