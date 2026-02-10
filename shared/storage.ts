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
