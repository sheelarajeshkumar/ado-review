/**
 * Storage key definitions and typed helpers.
 *
 * All browser.storage.local access goes through these helpers
 * to ensure consistent key names and type safety.
 */

/** Storage key constants. */
export const STORAGE_KEYS = {
  PAT: 'pat',
  AUTH_METHOD: 'auth_method',
  OPENAI_API_KEY: 'openai_api_key',
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
