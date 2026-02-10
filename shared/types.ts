/**
 * Shared type definitions for PEP Review extension.
 *
 * Used across content scripts, service worker, and extension pages.
 */

/** Parsed Azure DevOps pull request URL components. */
export interface PrInfo {
  /** Azure DevOps organization name */
  org: string;
  /** Project name within the organization */
  project: string;
  /** Repository name */
  repo: string;
  /** Pull request numeric ID */
  prId: number;
  /** Base URL for the org/project: https://dev.azure.com/{org}/{project} */
  baseUrl: string;
}

/** Authentication method used to access Azure DevOps. */
export type AuthMethod = 'session' | 'pat' | 'none';

/** Current authentication status. */
export interface AuthStatus {
  /** Whether the user is authenticated with Azure DevOps */
  authenticated: boolean;
  /** Which authentication method is active */
  method: AuthMethod;
}
