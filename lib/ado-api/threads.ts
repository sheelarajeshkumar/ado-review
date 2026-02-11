/**
 * PR comment thread creation (inline + summary).
 *
 * Posts code review findings as inline comments on specific file lines,
 * and summary comments at the PR level.
 */

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';
import type { Finding } from '@/lib/review/schemas';

/** Track last post time for rate-limit prevention (Pitfall 6). */
let lastPostTime = 0;

/** Minimum delay between POST requests to avoid rate limiting. */
const MIN_POST_INTERVAL_MS = 150;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enforce minimum delay between sequential POST requests.
 */
async function enforcePostDelay(): Promise<void> {
  const elapsed = Date.now() - lastPostTime;
  if (lastPostTime > 0 && elapsed < MIN_POST_INTERVAL_MS) {
    await sleep(MIN_POST_INTERVAL_MS - elapsed);
  }
}

/**
 * Post an inline comment thread on a specific file line.
 *
 * Creates a new thread with the finding's severity tag, message, and
 * optional suggestion anchored to the specified line in the PR diff.
 *
 * @param prInfo - Parsed PR URL components
 * @param filePath - Path to the file within the repository
 * @param finding - The code review finding to post
 * @param iterationId - The PR iteration ID for context
 */
export async function postInlineComment(
  prInfo: PrInfo,
  filePath: string,
  finding: Finding,
  iterationId: number,
): Promise<void> {
  await enforcePostDelay();

  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/threads`;

  const severityTag = `**[${finding.severity}]**`;
  let content = `${severityTag} ${finding.message}`;
  if (finding.suggestion) {
    content += `\n\n**Suggestion:** ${finding.suggestion}`;
  }
  if (finding.why) {
    content += `\n\n**Why:** ${finding.why}`;
  }

  // Ensure filePath starts with '/' for ADO thread context
  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

  await adoFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content,
          commentType: 1, // text
        },
      ],
      status: 6, // pending
      threadContext: {
        filePath: normalizedPath,
        rightFileStart: { line: finding.line, offset: 1 },
        rightFileEnd: { line: finding.line, offset: 1000 }, // highlight full line
      },
    }),
  });

  lastPostTime = Date.now();
}

/**
 * Post a summary comment at the PR level (no file context).
 *
 * @param prInfo - Parsed PR URL components
 * @param summaryMarkdown - Markdown content for the summary
 */
export async function postSummaryComment(
  prInfo: PrInfo,
  summaryMarkdown: string,
): Promise<void> {
  await enforcePostDelay();

  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/threads`;

  await adoFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content: summaryMarkdown,
          commentType: 1, // text
        },
      ],
      status: 6, // pending
    }),
  });

  lastPostTime = Date.now();
}
