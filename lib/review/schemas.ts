/**
 * Zod schemas for LLM output validation.
 *
 * Defines the structured output format that the LLM must return
 * for each file review. Used with AI SDK's Output.object() to
 * ensure validated, typed review findings.
 */

import { z } from 'zod';

/** Schema for a single code review finding. */
export const FindingSchema = z.object({
  line: z.number().describe('The line number in the file where the issue is'),
  severity: z.enum(['Critical', 'Warning', 'Info']).describe('Issue severity'),
  message: z.string().describe('Clear description of the issue found'),
  suggestion: z.string().nullable().describe('Suggested fix or improvement'),
});

/** Schema for the complete review of a single file. */
export const FileReviewSchema = z.object({
  findings: z.array(FindingSchema).describe('List of issues found in this file'),
  summary: z.string().describe('One-sentence summary of this file review'),
});

/** Inferred type for a single finding. */
export type Finding = z.infer<typeof FindingSchema>;

/** Inferred type for a complete file review. */
export type FileReview = z.infer<typeof FileReviewSchema>;

/** Schema for summary generation input (utility type, not LLM output). */
export const SummaryInputSchema = z.object({
  filePath: z.string(),
  summary: z.string(),
  findingCount: z.number(),
  criticalCount: z.number(),
  warningCount: z.number(),
  infoCount: z.number(),
});

/** Inferred type for summary input. */
export type SummaryInput = z.infer<typeof SummaryInputSchema>;
