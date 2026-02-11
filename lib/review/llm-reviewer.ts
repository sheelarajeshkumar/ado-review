/**
 * Single-file LLM code review via Vercel AI SDK.
 *
 * Sends a file's content to the configured AI provider and returns a
 * validated structured review using AI SDK's generateText with
 * Output.object() and the Zod-validated FileReviewSchema.
 */

import { generateText, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AiProviderConfig } from '@/shared/types';
import { FileReviewSchema, type FileReview } from './schemas';
import { buildSystemPrompt, buildFileReviewPrompt } from './prompt-builder';

/**
 * Return a config pointing at the fast model if one is configured,
 * otherwise return the original config unchanged.
 */
export function getFastConfig(config: AiProviderConfig): AiProviderConfig {
  if (!config.fastModel) return config;
  return {
    ...config,
    provider: config.fastProvider || config.provider,
    model: config.fastModel,
  };
}

/**
 * Create a Vercel AI SDK model instance from the provider config.
 */
function createModel(config: AiProviderConfig) {
  switch (config.provider) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      })(config.model);
    case 'anthropic':
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
    case 'ollama':
      return createOpenAI({
        apiKey: 'ollama',
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
      })(config.model);
  }
}

/**
 * Review a single file using the configured AI provider and return validated findings.
 *
 * @param filePath - Path to the file being reviewed
 * @param fileContent - The file's source code
 * @param changeType - The type of change ('add', 'edit', 'rename')
 * @param providerConfig - AI provider configuration from extension storage
 * @returns Validated FileReview with findings array and summary
 * @throws Error if the LLM returns no structured output
 */
export async function reviewSingleFile(
  filePath: string,
  fileContent: string,
  changeType: string,
  providerConfig: AiProviderConfig,
): Promise<FileReview> {
  const model = createModel(providerConfig);

  const { output } = await generateText({
    model,
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
