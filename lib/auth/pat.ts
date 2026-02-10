/**
 * Personal Access Token (PAT) authentication for Azure DevOps.
 *
 * Handles PAT format validation, live testing against Azure DevOps,
 * secure storage via chrome.storage.local, and header generation.
 * PAT is encoded as Basic auth: base64(':' + pat).
 */

import { getPat, setPat } from '@/shared/storage';
import { PAT_LENGTH, CONNECTION_DATA_PATH } from '@/shared/constants';

/**
 * Validate the format of a PAT string.
 *
 * Checks that the PAT is exactly PAT_LENGTH characters (84)
 * and contains no whitespace.
 *
 * @param pat - The PAT string to validate
 * @returns Validation result with optional error message
 */
export function validatePatFormat(pat: string): { valid: boolean; error?: string } {
  if (pat.length !== PAT_LENGTH) {
    return { valid: false, error: `PAT must be exactly ${PAT_LENGTH} characters (got ${pat.length})` };
  }

  if (/\s/.test(pat)) {
    return { valid: false, error: 'PAT must not contain whitespace' };
  }

  return { valid: true };
}

/**
 * Test a PAT against Azure DevOps by making a live API call.
 *
 * Makes a GET request to the connectionData endpoint using
 * Basic auth with the provided PAT.
 *
 * @param pat - The PAT to test
 * @param orgUrl - Optional org URL (defaults to https://dev.azure.com)
 * @returns Validation result with optional error message
 */
export async function testPat(
  pat: string,
  orgUrl?: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const baseUrl = orgUrl || 'https://dev.azure.com';
    const response = await fetch(`${baseUrl}${CONNECTION_DATA_PATH}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(':' + pat)}`,
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    return { valid: false, error: `PAT rejected by Azure DevOps (HTTP ${response.status})` };
  } catch (err) {
    return { valid: false, error: `Network error testing PAT: ${String(err)}` };
  }
}

/**
 * Attempt to authenticate using a stored PAT.
 *
 * Reads the PAT from chrome.storage.local. If available,
 * returns the auth method and Authorization header.
 * Does NOT re-validate the PAT on every call (validation happens on save).
 *
 * @returns Auth result with method and headers, or null if no PAT stored
 */
export async function tryPatAuth(): Promise<{
  method: 'pat';
  headers: Record<string, string>;
} | null> {
  const pat = await getPat();
  if (!pat) {
    return null;
  }

  return {
    method: 'pat',
    headers: {
      'Authorization': `Basic ${btoa(':' + pat)}`,
    },
  };
}

/**
 * Validate, test, and store a PAT.
 *
 * 1. Validates format (length, no whitespace)
 * 2. Tests against Azure DevOps connectionData endpoint
 * 3. Stores via chrome.storage.local on success
 *
 * @param pat - The PAT to save
 * @param orgUrl - Optional org URL for testing (defaults to https://dev.azure.com)
 * @returns Success result or error
 */
export async function savePat(
  pat: string,
  orgUrl?: string,
): Promise<{ success: boolean; error?: string }> {
  const formatResult = validatePatFormat(pat);
  if (!formatResult.valid) {
    return { success: false, error: formatResult.error };
  }

  const testResult = await testPat(pat, orgUrl);
  if (!testResult.valid) {
    return { success: false, error: testResult.error };
  }

  await setPat(pat);
  return { success: true };
}
