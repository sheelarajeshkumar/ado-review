/**
 * File content retrieval at specific commits.
 *
 * Uses the Azure DevOps Items API to fetch file content
 * at a specific commit version.
 */

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';

/**
 * Fetch file content from a specific commit.
 *
 * @param prInfo - Parsed PR URL components
 * @param filePath - Path to the file within the repository
 * @param commitId - The commit SHA to fetch the file at
 * @returns The file content as a string, or empty string if not available
 */
export async function getFileContent(
  prInfo: PrInfo,
  filePath: string,
  commitId: string,
): Promise<string> {
  const url =
    `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/items` +
    `?path=${encodeURIComponent(filePath)}` +
    `&includeContent=true` +
    `&versionDescriptor.version=${commitId}` +
    `&versionDescriptor.versionType=commit` +
    `&$format=json`;

  const response = await adoFetch(url);
  const data = await response.json();
  return data.content ?? '';
}
