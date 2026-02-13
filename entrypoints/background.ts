/**
 * Background service worker for ADO Review extension.
 *
 * Handles messages from content scripts, popup, and options page
 * via a handler registry pattern. All handlers are async and the
 * message listener returns true to keep the channel open.
 *
 * IMPORTANT:
 * - No global variables for state (service workers terminate)
 * - No setTimeout/setInterval (use chrome.alarms if needed)
 * - Return true from listener for async handlers
 */

import { checkAuth } from '@/lib/auth/manager';
import { savePat } from '@/lib/auth/pat';
import { runReview } from '@/lib/review/orchestrator';
import { postFileFindings, buildSummaryMarkdown } from '@/lib/review/comment-mapper';
import { postSummaryComment } from '@/lib/ado-api/threads';
import type { AuthStatus, PrInfo, FileReviewResult } from '@/shared/types';
import type { PortMessage } from '@/shared/messages';

export default defineBackground(() => {
  /** Message handler registry -- dispatches by message type. */
  const handlers: Record<
    string,
    (payload: any, sender: Browser.runtime.MessageSender) => Promise<unknown>
  > = {
    CHECK_AUTH: handleCheckAuth,
    SAVE_PAT: handleSavePat,
    POST_REVIEW_COMMENTS: handlePostReviewComments,
  };

  browser.runtime.onMessage.addListener(
    (message: { type: string; payload: unknown }, sender, sendResponse) => {
      const handler = handlers[message.type];
      if (handler) {
        handler(message.payload, sender).then(sendResponse);
        return true; // Keep channel open for async response
      }
    },
  );

  // Handle long-lived port connections for review sessions
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'review') return;

    port.onMessage.addListener(async (msg: PortMessage) => {
      if (msg.type === 'START_REVIEW') {
        try {
          await runReview(msg.payload.prInfo, (progress) => {
            try {
              port.postMessage(progress);
            } catch {
              // Port may have disconnected -- ignore
            }
          });
        } catch (error) {
          try {
            port.postMessage({
              type: 'REVIEW_ERROR',
              payload: {
                message: error instanceof Error ? error.message : String(error),
              },
            });
          } catch {
            // Port disconnected
          }
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.log('[ADO Review] Review port disconnected');
    });
  });

  console.log('[ADO Review] Service worker started');
});

/**
 * Handle CHECK_AUTH message: check current auth status.
 */
async function handleCheckAuth(
  payload: { orgUrl: string },
): Promise<AuthStatus> {
  return checkAuth(payload.orgUrl);
}

/**
 * Handle SAVE_PAT message: validate, test, and store PAT.
 */
async function handleSavePat(
  payload: { pat: string; orgUrl?: string },
): Promise<{ success: boolean; error?: string }> {
  return savePat(payload.pat, payload.orgUrl);
}

/**
 * Handle POST_REVIEW_COMMENTS message: post findings as pending comments on the PR.
 */
async function handlePostReviewComments(
  payload: { prInfo: PrInfo; fileResults: FileReviewResult[]; iterationId: number; prTitle: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { prInfo, fileResults, iterationId, prTitle } = payload;

    // Post inline comments for each file with findings
    for (const file of fileResults) {
      if (file.status !== 'success' || !file.findings?.length) continue;
      await postFileFindings(prInfo, file.filePath, file.findings, iterationId);
    }

    // Build and post summary comment
    const results = fileResults.map((f) => ({
      filePath: f.filePath,
      status: f.status as 'success' | 'error' | 'skipped',
      findings: f.findings ?? [],
      fileSummary: '',
      error: f.error,
    }));
    const summaryMarkdown = buildSummaryMarkdown(results, prTitle);
    await postSummaryComment(prInfo, summaryMarkdown);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
