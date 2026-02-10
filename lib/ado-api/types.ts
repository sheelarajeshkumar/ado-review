/**
 * Azure DevOps REST API response type definitions.
 *
 * These represent raw API response shapes, not shared application types.
 */

/** ADO Pull Request response (GET /pullRequests/{id}). */
export interface AdoPullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  repository: { id: string; name: string };
  lastMergeSourceCommit: { commitId: string };
  lastMergeTargetCommit: { commitId: string };
}

/** Simplified PR details extracted from AdoPullRequest. */
export interface PrDetails {
  sourceCommitId: string;
  targetCommitId: string;
  title: string;
  description: string;
  repositoryId: string;
}

/** ADO Iteration (from iterations list endpoint). */
export interface AdoIteration {
  id: number;
  createdDate: string;
}

/** ADO Iteration Change entry. */
export interface IterationChange {
  changeTrackingId: number;
  changeId: number;
  item: { objectId: string; path: string };
  changeType: number; // VersionControlChangeType enum
}

/** Maps ADO changeType numbers to readable strings. */
export const CHANGE_TYPE_MAP: Record<number, string> = {
  1: 'add',
  2: 'edit',
  16: 'delete',
  8: 'rename',
};

/** ADO CommentPosition (line + offset). */
export interface CommentPosition {
  line: number;
  offset: number;
}

/** ADO ThreadContext for inline comments. */
export interface ThreadContext {
  filePath: string;
  rightFileStart: CommentPosition;
  rightFileEnd: CommentPosition;
}
