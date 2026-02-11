/**
 * Top-level review pipeline coordinator.
 *
 * Orchestrates the full review flow: fetch PR data, filter files,
 * review each file with retry, and send results back to the content
 * script. Comments are NOT posted automatically — the user reviews
 * findings in the panel first and clicks "Post to PR" when ready.
 *
 * Error isolation ensures one file failure does not stop the
 * pipeline (CORE-05).
 */

import type { PrInfo, ReviewProgress, ReviewSummary, FileReviewResult } from '@/shared/types';
import type { PortMessage } from '@/shared/messages';
import { getAiProviderConfig } from '@/shared/storage';
import { getPrDetails, getLatestIterationId, getChangedFiles } from '@/lib/ado-api/pull-requests';
import { getFileContent } from '@/lib/ado-api/file-content';
import { CHANGE_TYPE_MAP } from '@/lib/ado-api/types';
import { shouldSkipFile, shouldSkipByChangeType } from './file-filter';
import { reviewSingleFile } from './llm-reviewer';
import { retryWithBackoff } from './retry';
import type { SingleFileResult } from './types';
import type { Finding } from './schemas';

/**
 * Run the full review pipeline for a pull request.
 *
 * Steps:
 * 1. Get API key from storage
 * 2. Fetch PR details and iteration info
 * 3. Get changed files and filter non-code files
 * 4. Review each file sequentially with retry
 * 5. Send completion with findings (no auto-posting)
 *
 * Error isolation: if one file fails after retries, the orchestrator
 * continues to the next file. Only catastrophic errors (no API key,
 * can't fetch PR) abort the entire review.
 *
 * @param prInfo - Parsed PR URL components
 * @param onProgress - Callback for progress/status messages over the port
 */
export async function runReview(
  prInfo: PrInfo,
  onProgress: (msg: PortMessage) => void,
): Promise<void> {
  const startTime = Date.now();

  // 1. Get AI provider config
  const providerConfig = await getAiProviderConfig();
  if (!providerConfig) {
    onProgress({
      type: 'REVIEW_ERROR',
      payload: { message: 'AI provider not configured. Set it in extension options.' },
    });
    return;
  }

  // 2. Fetch PR details
  let prDetails;
  try {
    prDetails = await getPrDetails(prInfo);
  } catch (error) {
    onProgress({
      type: 'REVIEW_ERROR',
      payload: {
        message: `Failed to fetch PR details: ${error instanceof Error ? error.message : String(error)}`,
      },
    });
    return;
  }

  // 3. Get latest iteration
  const iterationId = await getLatestIterationId(prInfo);

  // 4. Get changed files
  const changes = await getChangedFiles(prInfo, iterationId);

  // 5. Filter files
  const reviewableChanges: Array<{ path: string; changeType: string; change: (typeof changes)[0] }> = [];
  let skippedCount = 0;

  for (const change of changes) {
    const changeTypeStr = CHANGE_TYPE_MAP[change.changeType] ?? 'edit';

    if (shouldSkipByChangeType(changeTypeStr) || shouldSkipFile(change.item.path)) {
      skippedCount++;
    } else {
      reviewableChanges.push({
        path: change.item.path,
        changeType: changeTypeStr,
        change,
      });
    }
  }

  // 6. Report total
  onProgress({
    type: 'REVIEW_PROGRESS',
    payload: {
      totalFiles: reviewableChanges.length,
      fileIndex: 0,
      currentFile: '',
      status: 'reviewing',
    },
  });

  // 7. Review loop with error isolation (CORE-05)
  const results: SingleFileResult[] = [];

  for (let i = 0; i < reviewableChanges.length; i++) {
    const { path: filePath, changeType } = reviewableChanges[i];

    // Progress: starting file
    onProgress({
      type: 'REVIEW_PROGRESS',
      payload: {
        currentFile: filePath,
        fileIndex: i + 1,
        totalFiles: reviewableChanges.length,
        status: 'reviewing',
      },
    });

    try {
      const fileResult = await retryWithBackoff(
        async () => {
          const content = await getFileContent(prInfo, filePath, prDetails.sourceCommitId);
          return reviewSingleFile(filePath, content, changeType, providerConfig);
        },
        { maxRetries: 2, baseDelayMs: 1000 },
      );

      results.push({
        filePath,
        status: 'success',
        findings: fileResult.findings,
        fileSummary: fileResult.summary,
      });

      const fileReviewResult: FileReviewResult = {
        filePath,
        status: 'success',
        findingCount: fileResult.findings.length,
        findings: fileResult.findings,
      };
      onProgress({ type: 'REVIEW_FILE_COMPLETE', payload: fileReviewResult });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      results.push({
        filePath,
        status: 'error',
        findings: [],
        fileSummary: '',
        error: errorMessage,
      });

      const fileReviewResult: FileReviewResult = {
        filePath,
        status: 'error',
        error: errorMessage,
      };
      onProgress({ type: 'REVIEW_FILE_COMPLETE', payload: fileReviewResult });
    }
  }

  // 8. Send completion (no auto-posting — user posts from the panel)
  const allFindings: Finding[] = results.flatMap((r) => r.findings);
  const summary: ReviewSummary = {
    totalFiles: reviewableChanges.length + skippedCount,
    reviewedFiles: results.filter((r) => r.status === 'success').length,
    skippedFiles: skippedCount,
    errorFiles: results.filter((r) => r.status === 'error').length,
    totalFindings: allFindings.length,
    findingsBySeverity: {
      Critical: allFindings.filter((f) => f.severity === 'Critical').length,
      Warning: allFindings.filter((f) => f.severity === 'Warning').length,
      Info: allFindings.filter((f) => f.severity === 'Info').length,
    },
    durationMs: Date.now() - startTime,
    iterationId,
    prTitle: prDetails.title,
  };

  onProgress({ type: 'REVIEW_COMPLETE', payload: summary });
}
