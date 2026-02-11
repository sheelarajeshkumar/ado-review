/**
 * Storage key definitions and typed helpers.
 *
 * All browser.storage.local access goes through these helpers
 * to ensure consistent key names and type safety.
 */

import type { AiProviderConfig } from './types';

/** Storage key constants. */
export const STORAGE_KEYS = {
  PAT: 'pat',
  AUTH_METHOD: 'auth_method',
  OPENAI_API_KEY: 'openai_api_key',
  AI_PROVIDER_CONFIG: 'ai_provider_config',
  ORG_URL: 'org_url',
} as const;

/**
 * Retrieve the stored Personal Access Token.
 *
 * @returns The PAT string, or null if not set
 */
export async function getPat(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.PAT);
  return (result[STORAGE_KEYS.PAT] as string) ?? null;
}

/**
 * Store a Personal Access Token.
 *
 * @param pat - The PAT to store
 */
export async function setPat(pat: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.PAT]: pat });
}

/**
 * Remove the stored Personal Access Token.
 */
export async function clearPat(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEYS.PAT);
}

/**
 * Retrieve the stored OpenAI API key.
 *
 * @returns The API key string, or null if not set
 */
export async function getOpenAiApiKey(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.OPENAI_API_KEY);
  return (result[STORAGE_KEYS.OPENAI_API_KEY] as string) ?? null;
}

/**
 * Store an OpenAI API key.
 *
 * @param key - The API key to store
 */
export async function setOpenAiApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.OPENAI_API_KEY]: key });
}

/**
 * Retrieve the AI provider configuration.
 *
 * Falls back to the legacy OPENAI_API_KEY for backward compatibility
 * with existing installs that only had an OpenAI key configured.
 *
 * @returns The provider config, or null if nothing is configured
 */
export async function getAiProviderConfig(): Promise<AiProviderConfig | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.AI_PROVIDER_CONFIG);
  const stored = result[STORAGE_KEYS.AI_PROVIDER_CONFIG] as AiProviderConfig | undefined;
  if (stored) return stored;

  // Backward compat: migrate legacy OpenAI-only key
  const legacyKey = await getOpenAiApiKey();
  if (legacyKey) {
    return { provider: 'openai', model: 'gpt-4o', apiKey: legacyKey };
  }

  return null;
}

/**
 * Store the AI provider configuration.
 *
 * @param config - The provider config to store
 */
export async function setAiProviderConfig(config: AiProviderConfig): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.AI_PROVIDER_CONFIG]: config });
}

/**
 * Retrieve the stored Azure DevOps organization URL.
 *
 * @returns The org URL (e.g., "https://dev.azure.com/MyOrg"), or null if not set
 */
export async function getOrgUrl(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.ORG_URL);
  return (result[STORAGE_KEYS.ORG_URL] as string) ?? null;
}

/**
 * Store the Azure DevOps organization URL.
 *
 * @param url - The org URL to store
 */
export async function setOrgUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.ORG_URL]: url });
}
