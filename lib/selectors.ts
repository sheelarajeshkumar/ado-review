/**
 * Centralized DOM selectors for Azure DevOps page elements.
 *
 * All CSS selectors targeting the Azure DevOps UI live here.
 * When Azure DevOps updates break selectors, only this file needs updating.
 *
 * Strategy:
 * 1. Prefer data-* attributes and aria-* attributes (more stable)
 * 2. Use semantic HTML element types as fallbacks
 * 3. Multiple selectors per target, tried in order
 */

/** All Azure DevOps DOM selectors, organized by target element. */
export const SELECTORS = {
  /** Container for the PR header command bar (beside Approve / Complete buttons) */
  PR_HEADER_ACTIONS: [
    '.repos-pr-header .bolt-header-command-bar',
    '.bolt-header-command-bar-area .bolt-header-command-bar',
    '[data-focuszone-id] .bolt-header-command-bar',
    '.page-content .bolt-header-commandbar',
    '.repos-pr-header-actions',
  ],

  /** The PR page title area (for verifying we're on a PR page) */
  PR_TITLE: [
    '.repos-pr-title',
    '.bolt-header-title',
    'h1[role="heading"]',
  ],
} as const;

/**
 * Try multiple selectors in order, return first match.
 *
 * @param selectors - Array of CSS selectors to try in priority order
 * @returns The first matching element, or null if none match
 */
export function querySelector(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Health check: log warnings for selector groups that match nothing.
 *
 * Call on content script init to detect broken selectors early.
 * Only logs warnings -- does not throw.
 */
export function checkSelectorHealth(): void {
  for (const [name, selectors] of Object.entries(SELECTORS)) {
    const found = querySelector(selectors as readonly string[]);
    if (!found) {
      console.warn(
        `[PEP Review] Selector "${name}" matched no elements. Azure DevOps UI may have updated.`,
      );
    }
  }
}

/**
 * Wait for a DOM element matching any of the given selectors to appear.
 *
 * Uses MutationObserver for efficient detection. Falls back to a final
 * check at timeout. This is a standalone utility with no framework
 * dependencies for reuse across contexts.
 *
 * @param selectors - Array of CSS selectors to try in priority order
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns The first matching element, or null if timeout expires
 */
export function waitForElement(
  selectors: readonly string[],
  timeoutMs: number,
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check immediately
    const existing = querySelector(selectors);
    if (existing) {
      resolve(existing);
      return;
    }

    let resolved = false;

    const observer = new MutationObserver(() => {
      const el = querySelector(selectors);
      if (el && !resolved) {
        resolved = true;
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        resolve(querySelector(selectors)); // One last try
      }
    }, timeoutMs);
  });
}
