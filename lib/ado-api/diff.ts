/**
 * Unified diff fetching for pull request files.
 *
 * Uses the Azure DevOps Diffs API to get line-level changes between
 * the target (base) and source (PR) branches, so the review can
 * focus only on changed lines while keeping the full file as context.
 */

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';

/** A contiguous range of changed lines in the source (PR) version. */
export interface ChangedRange {
  startLine: number;
  endLine: number;
}

/**
 * Fetch the diff for a single file between the target and source commits.
 *
 * Uses the Items API with diff parameters to get a unified diff, then
 * parses the `@@ ... @@` hunk headers to extract changed line ranges
 * in the new (source) version of the file.
 *
 * @param prInfo - Parsed PR URL components
 * @param filePath - Path to the file within the repository
 * @param baseCommitId - The target branch commit (merge target)
 * @param sourceCommitId - The PR source branch commit
 * @returns Array of changed line ranges, or null if diff is unavailable
 */
export async function getFileDiff(
  prInfo: PrInfo,
  filePath: string,
  baseCommitId: string,
  sourceCommitId: string,
): Promise<ChangedRange[] | null> {
  try {
    const url =
      `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/diffs/commits` +
      `?baseVersion=${baseCommitId}&baseVersionType=commit` +
      `&targetVersion=${sourceCommitId}&targetVersionType=commit` +
      `&diffCommonCommit=true`;

    const response = await adoFetch(url);
    const data = await response.json();

    // Find the matching change entry for this file
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const change = data.changes?.find(
      (c: { item?: { path?: string } }) =>
        c.item?.path === normalizedPath || c.item?.path === filePath,
    );

    if (!change) return null;

    // If the API doesn't provide line-level info, fall back to fetching
    // the raw diff text for this specific file
    return await getFileDiffFromText(prInfo, filePath, baseCommitId, sourceCommitId);
  } catch {
    // Diff API failed — return null so caller falls back gracefully
    return null;
  }
}

/**
 * Fetch a text-based diff for a single file and parse hunk headers.
 *
 * Falls back to comparing the two versions of the file directly and
 * computing a simple line-level diff.
 */
async function getFileDiffFromText(
  prInfo: PrInfo,
  filePath: string,
  baseCommitId: string,
  sourceCommitId: string,
): Promise<ChangedRange[] | null> {
  try {
    // Fetch both versions of the file
    const [baseContent, sourceContent] = await Promise.all([
      fetchFileText(prInfo, filePath, baseCommitId),
      fetchFileText(prInfo, filePath, sourceCommitId),
    ]);

    if (baseContent === null) {
      // New file — entire file is changed
      return null;
    }

    return computeChangedRanges(baseContent, sourceContent ?? '');
  } catch {
    return null;
  }
}

/**
 * Fetch raw file content at a specific commit, returning null if not found.
 */
async function fetchFileText(
  prInfo: PrInfo,
  filePath: string,
  commitId: string,
): Promise<string | null> {
  try {
    const url =
      `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/items` +
      `?path=${encodeURIComponent(filePath)}` +
      `&includeContent=true` +
      `&versionDescriptor.version=${commitId}` +
      `&versionDescriptor.versionType=commit` +
      `&$format=json`;

    const response = await adoFetch(url);
    const data = await response.json();
    return data.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare base and source line-by-line to find changed line ranges
 * in the source version. Uses a simple diff: any line that differs
 * from the base at the same position, or lines added/removed, are
 * marked as changed.
 */
function computeChangedRanges(base: string, source: string): ChangedRange[] {
  const baseLines = base.split('\n');
  const sourceLines = source.split('\n');
  const ranges: ChangedRange[] = [];

  let inChange = false;
  let changeStart = 0;

  // Walk through source lines — a line is "changed" if the base line
  // at the same position differs or doesn't exist
  for (let i = 0; i < sourceLines.length; i++) {
    const sourceLine = sourceLines[i];
    const baseLine = i < baseLines.length ? baseLines[i] : undefined;
    const isChanged = baseLine !== sourceLine;

    if (isChanged && !inChange) {
      inChange = true;
      changeStart = i + 1; // 1-based
    } else if (!isChanged && inChange) {
      inChange = false;
      ranges.push({ startLine: changeStart, endLine: i }); // i is 0-based, endLine is the last changed line (1-based)
    }
  }

  // Close trailing change
  if (inChange) {
    ranges.push({ startLine: changeStart, endLine: sourceLines.length });
  }

  // If source is shorter than base, mark that the file had deletions at the end
  // (no new lines to mark, but the diff is noted)

  return ranges;
}
