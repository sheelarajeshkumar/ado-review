/**
 * Internal types for the review pipeline.
 *
 * These are used within lib/review/ modules and are not
 * part of the shared types exported to content scripts.
 */

import type { PrInfo } from '@/shared/types';
import type { PrDetails, IterationChange } from '@/lib/ado-api/types';
import type { Finding } from './schemas';

/** Input context for a review session. */
export interface ReviewContext {
  prInfo: PrInfo;
  prDetails: PrDetails;
  iterationId: number;
  changes: IterationChange[];
  apiKey: string;
}

/** A file prepared for LLM review (after filtering and content fetch). */
export interface ReviewableFile {
  path: string;
  content: string;
  changeType: string; // 'add' | 'edit' | 'rename'
}

/** Result of the LLM reviewing a single file (internal, richer than FileReviewResult). */
export interface SingleFileResult {
  filePath: string;
  status: 'success' | 'error' | 'skipped';
  findings: Finding[];
  fileSummary: string;
  error?: string;
}
