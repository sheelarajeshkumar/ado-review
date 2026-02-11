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
 * Fetches both versions of the file and computes changed line ranges
 * using an LCS-based comparison.
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
    return await getFileDiffFromText(prInfo, filePath, baseCommitId, sourceCommitId);
  } catch {
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
 * Compare base and source to find changed line ranges in the source version.
 *
 * Uses an LCS (Longest Common Subsequence) approach:
 * 1. Trim common prefix and suffix lines (O(n), handles typical edits)
 * 2. Run LCS-DP on the remaining middle to identify matched lines
 * 3. Source lines NOT matched by LCS are "changed" (inserted or modified)
 *
 * Falls back to greedy matching when the middle section is very large
 * (n*m > 4M) to avoid excessive memory use.
 */
function computeChangedRanges(base: string, source: string): ChangedRange[] {
  const baseLines = base.split('\n');
  const sourceLines = source.split('\n');

  // --- Trim common prefix ---
  let prefix = 0;
  while (
    prefix < baseLines.length &&
    prefix < sourceLines.length &&
    baseLines[prefix] === sourceLines[prefix]
  ) {
    prefix++;
  }

  // --- Trim common suffix ---
  let suffix = 0;
  while (
    suffix < baseLines.length - prefix &&
    suffix < sourceLines.length - prefix &&
    baseLines[baseLines.length - 1 - suffix] === sourceLines[sourceLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const baseMid = baseLines.slice(prefix, baseLines.length - suffix);
  const srcMid = sourceLines.slice(prefix, sourceLines.length - suffix);

  // If middle sections are empty, there are no changes (or only deletions)
  if (srcMid.length === 0) {
    return [];
  }

  // Find which source-middle lines are matched (unchanged) via LCS
  const matched: Set<number> =
    baseMid.length * srcMid.length > 4_000_000
      ? greedyMatch(baseMid, srcMid)
      : lcsMatchedSourceLines(baseMid, srcMid);

  // Build ranges from unmatched source-middle lines (offset back to full-file indices)
  const ranges: ChangedRange[] = [];
  let inChange = false;
  let changeStart = 0;

  for (let i = 0; i < srcMid.length; i++) {
    const isChanged = !matched.has(i);
    const lineNum = prefix + i + 1; // 1-based in full file

    if (isChanged && !inChange) {
      inChange = true;
      changeStart = lineNum;
    } else if (!isChanged && inChange) {
      inChange = false;
      ranges.push({ startLine: changeStart, endLine: lineNum - 1 });
    }
  }

  if (inChange) {
    ranges.push({ startLine: changeStart, endLine: prefix + srcMid.length });
  }

  return ranges;
}

/**
 * Standard LCS via dynamic programming. Returns the set of source-middle
 * line indices that are part of the longest common subsequence (i.e. unchanged).
 */
function lcsMatchedSourceLines(base: string[], source: string[]): Set<number> {
  const n = base.length;
  const m = source.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (base[i - 1] === source[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Back-trace to find matched source indices
  const matched = new Set<number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (base[i - 1] === source[j - 1]) {
      matched.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matched;
}

/**
 * Greedy fallback for very large diffs. Scans source lines and matches
 * each to the earliest available base line with the same content.
 * Less accurate than LCS but O(n+m) and bounded memory.
 */
function greedyMatch(base: string[], source: string[]): Set<number> {
  // Build a map from line content → list of base indices (in order)
  const baseMap = new Map<string, number[]>();
  for (let i = 0; i < base.length; i++) {
    const line = base[i];
    let list = baseMap.get(line);
    if (!list) {
      list = [];
      baseMap.set(line, list);
    }
    list.push(i);
  }

  const matched = new Set<number>();
  // Track next usable position per base-content bucket via cursor indices
  const cursors = new Map<string, number>();
  let minBaseIdx = -1; // matched base lines must be strictly increasing

  for (let j = 0; j < source.length; j++) {
    const line = source[j];
    const list = baseMap.get(line);
    if (!list) continue;

    const cursor = cursors.get(line) ?? 0;
    // Find next base index > minBaseIdx
    let k = cursor;
    while (k < list.length && list[k] <= minBaseIdx) {
      k++;
    }
    if (k < list.length) {
      matched.add(j);
      minBaseIdx = list[k];
      cursors.set(line, k + 1);
    }
  }

  return matched;
}
