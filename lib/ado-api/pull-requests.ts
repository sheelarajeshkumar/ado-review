/**
 * PR metadata, iterations, and changed files fetching.
 *
 * Uses adoFetch for authenticated requests to the Azure DevOps
 * Pull Requests REST API v7.1.
 */

import { adoFetch } from './client';
import type { PrDetails, AdoPullRequest, AdoIteration, IterationChange } from './types';
import type { PrInfo } from '@/shared/types';

/**
 * Fetch pull request details (source/target commits, title, description).
 *
 * @param prInfo - Parsed PR URL components
 * @returns Simplified PR details
 */
export async function getPrDetails(prInfo: PrInfo): Promise<PrDetails> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}`;
  const response = await adoFetch(url);
  const data = (await response.json()) as AdoPullRequest;

  return {
    sourceCommitId: data.lastMergeSourceCommit.commitId,
    targetCommitId: data.lastMergeTargetCommit.commitId,
    title: data.title,
    description: data.description ?? '',
    repositoryId: data.repository.id,
  };
}

/**
 * Get the latest iteration ID for a pull request.
 *
 * Iterations represent push events to the PR source branch.
 * The latest iteration contains the most recent changes.
 *
 * @param prInfo - Parsed PR URL components
 * @returns The highest iteration ID
 */
export async function getLatestIterationId(prInfo: PrInfo): Promise<number> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/iterations`;
  const response = await adoFetch(url);
  const data = await response.json();
  const iterations = data.value as AdoIteration[];
  return Math.max(...iterations.map((i) => i.id));
}

/**
 * Get all changed files for a specific PR iteration.
 *
 * Handles pagination by looping while the response returns a full page.
 *
 * @param prInfo - Parsed PR URL components
 * @param iterationId - The iteration to fetch changes for
 * @returns All iteration change entries
 */
export async function getChangedFiles(
  prInfo: PrInfo,
  iterationId: number,
): Promise<IterationChange[]> {
  const allChanges: IterationChange[] = [];
  let skip = 0;
  const top = 100;

  while (true) {
    const url =
      `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/iterations/${iterationId}/changes` +
      `?$top=${top}&$skip=${skip}`;
    const response = await adoFetch(url);
    const data = await response.json();

    const entries = data.changeEntries as IterationChange[];
    allChanges.push(...entries);

    if (entries.length < top) break;
    skip += top;
  }

  return allChanges;
}
