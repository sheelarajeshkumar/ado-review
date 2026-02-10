/**
 * Exponential backoff retry utility (CORE-06).
 *
 * Wraps an async function with automatic retry on failure,
 * using exponential backoff with jitter to avoid thundering herd.
 */

/** Configuration options for retry behavior. */
export interface RetryOptions {
  /** Maximum number of retry attempts (not counting the initial try). */
  maxRetries: number;
  /** Base delay in milliseconds (doubled for each subsequent retry). */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 30000). */
  maxDelayMs?: number;
}

/**
 * Retry an async function with exponential backoff and jitter.
 *
 * On each failure, waits an exponentially increasing delay before retrying.
 * Random jitter (0-1000ms) is added to prevent synchronized retries.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function on success
 * @throws The last error if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs = 30000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs,
      );

      console.warn(
        `[PEP Review] Retry attempt ${attempt + 1}/${maxRetries}`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // TypeScript: unreachable but needed for type safety
  throw new Error('Retry exhausted');
}
