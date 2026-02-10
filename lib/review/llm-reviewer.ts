/**
 * Single-file LLM code review via Vercel AI SDK.
 *
 * Sends a file's content to OpenAI and returns a validated structured
 * review using AI SDK's generateText with Output.object() and the
 * Zod-validated FileReviewSchema.
 */

import { generateText, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { FileReviewSchema, type FileReview } from './schemas';
import { buildSystemPrompt, buildFileReviewPrompt } from './prompt-builder';

/**
 * Review a single file using OpenAI and return validated findings.
 *
 * Creates a per-call OpenAI provider with the given API key, sends the
 * file content as a prompt, and validates the structured output against
 * the FileReviewSchema Zod schema via AI SDK's Output.object().
 *
 * @param filePath - Path to the file being reviewed
 * @param fileContent - The file's source code
 * @param changeType - The type of change ('add', 'edit', 'rename')
 * @param apiKey - OpenAI API key from extension storage
 * @returns Validated FileReview with findings array and summary
 * @throws Error if the LLM returns no structured output
 */
export async function reviewSingleFile(
  filePath: string,
  fileContent: string,
  changeType: string,
  apiKey: string,
): Promise<FileReview> {
  const openai = createOpenAI({ apiKey });

  const { output } = await generateText({
    model: openai('gpt-4o'),
    output: Output.object({ schema: FileReviewSchema }),
    system: buildSystemPrompt(),
    prompt: buildFileReviewPrompt(filePath, fileContent, changeType),
    maxOutputTokens: 4000,
  });

  if (!output) {
    throw new Error(`LLM returned no structured output for ${filePath}`);
  }

  return output;
}
