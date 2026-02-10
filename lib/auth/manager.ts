/**
 * Auth manager: orchestrates session-first authentication with PAT fallback.
 *
 * The cascade is:
 * 1. Try session auth (browser cookies via credentials:'include')
 * 2. If session fails, try PAT auth (from chrome.storage.local)
 * 3. If both fail, return unauthenticated
 *
 * No module-level state -- all persistent data goes through chrome.storage.
 */

import { testSessionAuth } from '@/lib/auth/session';
import { tryPatAuth } from '@/lib/auth/pat';
import type { AuthMethod, AuthStatus } from '@/shared/types';

/**
 * Check current authentication status against Azure DevOps.
 *
 * Tries session auth first, then PAT fallback.
 *
 * @param orgUrl - The Azure DevOps organization URL
 * @returns AuthStatus with authenticated flag and method
 */
export async function checkAuth(orgUrl: string): Promise<AuthStatus> {
  // 1. Try session-based auth (cookies)
  const sessionWorks = await testSessionAuth(orgUrl);
  if (sessionWorks) {
    return { authenticated: true, method: 'session' };
  }

  // 2. Fall back to PAT
  const patResult = await tryPatAuth();
  if (patResult) {
    return { authenticated: true, method: 'pat' };
  }

  // 3. No auth available
  return { authenticated: false, method: 'none' };
}

/**
 * Get authentication headers for Azure DevOps API calls.
 *
 * Same cascade: session first (empty headers -- cookies do the work),
 * then PAT (Authorization header). Returns null if no auth available.
 *
 * @param orgUrl - The Azure DevOps organization URL
 * @returns Auth method and headers, or null if not authenticated
 */
export async function getAuthHeaders(
  orgUrl: string,
): Promise<{ method: AuthMethod; headers: Record<string, string> } | null> {
  // 1. Try session auth -- no extra headers needed, cookies are sent via credentials:'include'
  const sessionWorks = await testSessionAuth(orgUrl);
  if (sessionWorks) {
    return { method: 'session', headers: {} };
  }

  // 2. Fall back to PAT -- returns method + Authorization header
  const patResult = await tryPatAuth();
  if (patResult) {
    return patResult;
  }

  // 3. No auth available
  return null;
}
