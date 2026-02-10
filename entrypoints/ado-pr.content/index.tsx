/**
 * Content script entrypoint for Azure DevOps PR pages.
 *
 * Matches broadly on all dev.azure.com pages so that SPA navigation
 * from non-PR pages to PR pages is handled correctly. The review button
 * is only mounted when the current URL is a PR URL.
 *
 * Uses WXT's createShadowRootUi for style isolation and wxt:locationchange
 * for SPA navigation detection.
 */

import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SELECTORS, waitForElement } from '@/lib/selectors';
import { parsePrUrl, isPullRequestUrl } from '@/lib/url-matcher';

/** Track current UI instance to prevent duplicate buttons. */
let currentUi: ShadowRootContentScriptUi<ReactDOM.Root> | null = null;

export default defineContentScript({
  matches: ['*://dev.azure.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Check if we're on a PR page on initial load
    if (isPullRequestUrl(window.location.href)) {
      await tryMount(ctx);
    }

    // Handle SPA navigation within Azure DevOps
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl, oldUrl }) => {
      const newUrlStr = newUrl.toString();
      const oldUrlStr = oldUrl.toString();
      const isOnPR = isPullRequestUrl(newUrlStr);
      const wasOnPR = isPullRequestUrl(oldUrlStr);

      if (isOnPR) {
        // Navigating TO a PR page (or between PRs) -- remove existing UI first
        if (currentUi) {
          currentUi.remove();
          currentUi = null;
        }
        await tryMount(ctx);
      } else if (wasOnPR && currentUi) {
        // Navigating AWAY from a PR page
        currentUi.remove();
        currentUi = null;
      }
    });
  },
});

/**
 * Attempt to mount the review button on the current PR page.
 *
 * Waits for the PR header anchor element to appear (up to 5 seconds),
 * parses the PR URL for context, then creates a Shadow DOM-isolated
 * React UI.
 */
async function tryMount(ctx: InstanceType<typeof ContentScriptContext>): Promise<void> {
  // Wait for the PR page DOM to render
  const anchor = await waitForElement(SELECTORS.PR_HEADER_ACTIONS, 5000);
  if (!anchor) {
    console.warn('[PEP Review] Could not find PR header. Selectors may need updating.');
    return;
  }

  const prInfo = parsePrUrl(window.location.href);
  if (!prInfo) return;

  const ui = await createShadowRootUi(ctx, {
    name: 'pep-review-button',
    position: 'inline',
    anchor,
    onMount: (uiContainer: HTMLElement) => {
      const wrapper = document.createElement('div');
      uiContainer.append(wrapper);
      const root = ReactDOM.createRoot(wrapper);
      root.render(<App prInfo={prInfo} />);
      return root;
    },
    onRemove: (root) => {
      root?.unmount();
    },
  });

  ui.mount();
  currentUi = ui;
}
