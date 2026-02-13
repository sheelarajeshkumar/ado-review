/**
 * Single-file LLM code review via Vercel AI SDK (cloud providers)
 * and official Ollama client (local models).
 *
 * Sends a file's content to the configured AI provider and returns a
 * validated structured review using Zod-validated FileReviewSchema.
 */

import { generateText, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Ollama } from 'ollama/browser';
import type { AiProviderConfig } from '@/shared/types';
import type { ChangedRange } from '@/lib/ado-api/diff';
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
 * Returns null for Ollama (handled separately via the official client).
 */
function createModel(config: AiProviderConfig) {
  switch (config.provider) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      }).chat(config.model);
    case 'anthropic': {
      // sk-ant-oat* = OAuth token (Bearer), sk-ant-api* = API key (x-api-key)
      const isOAuth = config.apiKey.includes('-oat');
      return createAnthropic({
        ...(isOAuth
          ? { authToken: config.apiKey }
          : { apiKey: config.apiKey }),
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(config.model);
    }
    case 'google':
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
    case 'external':
    case 'ollama':
      return null;
  }
}

/**
 * JSON Schema passed to Ollama's `format` parameter to constrain output
 * to the exact shape our Zod FileReviewSchema expects.
 */
const OLLAMA_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number', description: 'The line number where the issue is' },
          severity: { type: 'string', enum: ['Critical', 'Warning', 'Info'] },
          message: { type: 'string', description: 'Clear description of the issue' },
          suggestion: { type: ['string', 'null'], description: 'Suggested fix or improvement' },
          suggestedCode: { type: ['string', 'null'], description: 'Replacement code for the flagged lines, or null' },
          why: { type: 'string', description: 'Brief explanation of why this matters' },
        },
        required: ['line', 'severity', 'message', 'suggestion', 'suggestedCode', 'why'],
      },
    },
    summary: { type: 'string', description: 'One-sentence summary of this file review' },
  },
  required: ['findings', 'summary'],
};

/**
 * Review a file using the official Ollama client directly.
 * Passes a JSON Schema via `format` to constrain the model output,
 * then validates with Zod.
 */
async function reviewWithOllama(
  filePath: string,
  fileContent: string,
  changeType: string,
  config: AiProviderConfig,
  changedRanges: ChangedRange[] | null,
): Promise<FileReview> {
  const client = new Ollama({ host: config.baseUrl || 'http://localhost:11434' });

  const response = await client.chat({
    model: config.model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildFileReviewPrompt(filePath, fileContent, changeType, changedRanges) },
    ],
    format: OLLAMA_RESPONSE_SCHEMA,
    stream: false,
  });

  const raw = response.message.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Ollama returned invalid JSON for ${filePath}: ${raw.slice(0, 200)}`);
  }

  const result = FileReviewSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Ollama response failed validation for ${filePath}: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Extract the first JSON array from a free-form text response.
 * Searches for `[...]` blocks and attempts to parse each one.
 */
function extractJsonArray(text: string): unknown[] | null {
  const matches = text.match(/\[[\s\S]*?\n\s*\]/g);
  if (!matches) return null;
  for (const m of matches) {
    try {
      const parsed = JSON.parse(m);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* try next match */ }
  }
  return null;
}

/**
 * Map external API field names to our schema.
 * Handles: lineNumber→line, description→message, codeBlock→suggestedCode, explanation→why.
 */
function mapExternalFinding(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    line: raw.line ?? raw.lineNumber ?? raw.line_number ?? 0,
    severity: raw.severity ?? 'Info',
    message: raw.message ?? raw.description ?? '',
    suggestion: raw.suggestion ?? null,
    suggestedCode: raw.suggestedCode ?? raw.codeBlock ?? raw.code_block ?? null,
    why: raw.why ?? raw.explanation ?? '',
  };
}

/**
 * Review a file using an external OpenAI-compatible API.
 * The API may return free-form text with embedded JSON, so we extract
 * and map the fields to our schema.
 */
async function reviewWithExternal(
  filePath: string,
  fileContent: string,
  changeType: string,
  config: AiProviderConfig,
  changedRanges: ChangedRange[] | null,
): Promise<FileReview> {
  const model = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'http://localhost:8000/v1',
  }).chat(config.model);

  const { text } = await generateText({
    model,
    system: buildSystemPrompt(),
    prompt: buildFileReviewPrompt(filePath, fileContent, changeType, changedRanges),
    maxOutputTokens: 4000,
  });

  // Try direct JSON parse first (structured response)
  try {
    const direct = JSON.parse(text);
    const result = FileReviewSchema.safeParse(direct);
    if (result.success) return result.data;
  } catch { /* not pure JSON, extract from text */ }

  // Extract JSON array from free-form text and map fields
  const rawFindings = extractJsonArray(text);
  if (!rawFindings || rawFindings.length === 0) {
    return { findings: [], summary: 'No findings detected.' };
  }

  const mapped = {
    findings: rawFindings.map((f) => mapExternalFinding(f as Record<string, unknown>)),
    summary: `Review found ${rawFindings.length} finding(s) in ${filePath}`,
  };

  const result = FileReviewSchema.safeParse(mapped);
  if (!result.success) {
    throw new Error(`External API response failed validation for ${filePath}: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Review a single file using the configured AI provider and return validated findings.
 *
 * @param filePath - Path to the file being reviewed
 * @param fileContent - The file's source code (full file for context)
 * @param changeType - The type of change ('add', 'edit', 'rename')
 * @param providerConfig - AI provider configuration from extension storage
 * @param changedRanges - Ranges of changed lines, or null if entire file is new
 * @returns Validated FileReview with findings array and summary
 * @throws Error if the LLM returns no structured output
 */
export async function reviewSingleFile(
  filePath: string,
  fileContent: string,
  changeType: string,
  providerConfig: AiProviderConfig,
  changedRanges: ChangedRange[] | null = null,
): Promise<FileReview> {
  // Ollama and External use their own code paths
  if (providerConfig.provider === 'ollama') {
    return reviewWithOllama(filePath, fileContent, changeType, providerConfig, changedRanges);
  }
  if (providerConfig.provider === 'external') {
    return reviewWithExternal(filePath, fileContent, changeType, providerConfig, changedRanges);
  }

  const model = createModel(providerConfig)!;

  const { output } = await generateText({
    model,
    output: Output.object({ schema: FileReviewSchema }),
    system: buildSystemPrompt(),
    prompt: buildFileReviewPrompt(filePath, fileContent, changeType, changedRanges),
    maxOutputTokens: 4000,
  });

  if (!output) {
    throw new Error(`LLM returned no structured output for ${filePath}`);
  }

  return output;
}
