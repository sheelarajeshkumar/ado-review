# Phase 1: Extension Shell & Auth - Research

**Researched:** 2026-02-10
**Domain:** WXT Chrome Extension (Manifest V3) -- Content Script Injection, SPA Navigation, Azure DevOps Session Auth
**Confidence:** HIGH

## Summary

Phase 1 establishes the extension's foundation: activating on Azure DevOps PR URLs, injecting a review button that survives SPA navigation, and authenticating with Azure DevOps. The WXT framework (v0.20.x) provides nearly everything needed out of the box -- file-based entrypoints auto-generate the manifest, `createShadowRootUi` handles Shadow DOM isolation for the injected button, and the built-in `wxt:locationchange` custom event detects SPA navigation without manual history.pushState monkeypatching. The content script runs in the ISOLATED world by default (correct for this use case), and the service worker handles all API calls where host_permissions bypass CORS.

Authentication requires two paths. The primary "session-first" approach makes fetch requests from the service worker to `dev.azure.com` with `credentials: 'include'` and the domain listed in `host_permissions`. This causes the browser to include the user's existing Azure DevOps session cookies with the request, enabling zero-config auth for logged-in users. The fallback is PAT-based auth where the user enters a Personal Access Token, stored in `chrome.storage.local`, and sent as `Authorization: Basic ${btoa(':' + pat)}`. Both paths are proven patterns documented in Chrome extension and Azure DevOps official docs.

The biggest risks in this phase are: (1) Azure DevOps DOM instability -- the PR page uses React with compiled class names that change on sprint updates, so DOM selectors for the button injection point must be centralized and use fallback strategies; (2) the `wxt:locationchange` event currently uses URL polling (checking every 1 second), which means up to 1 second delay in detecting navigation -- acceptable but not instant; (3) service worker cookie behavior requires explicit `credentials: 'include'` on fetch calls -- cookies are NOT automatically sent from service workers even with `host_permissions`.

**Primary recommendation:** Use WXT's file-based entrypoints with `createShadowRootUi` for the review button, `wxt:locationchange` for SPA detection, and a two-tier auth module (session cookies via service worker fetch + PAT fallback) with all selectors centralized in a single file.

## Standard Stack

### Core (Phase 1 specific)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT | 0.20.x | Extension framework | File-based entrypoints, auto-manifest generation, `createShadowRootUi`, `wxt:locationchange` for SPA, HMR for content scripts. Decided in project STACK.md. |
| TypeScript | 5.9.x | Language | Type safety across all extension contexts. @types/chrome provides MV3 type definitions. Decided in project STACK.md. |
| React | 18.x | UI for injected button | WXT's `createShadowRootUi` has first-class React support via `onMount`/`onRemove` callbacks. Decided in project STACK.md. |
| @wxt-dev/module-react | latest | WXT React integration | Required for React support in WXT content scripts and extension pages. |

### Supporting (Phase 1 specific)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.x | Schema validation | Validate PAT format, URL parsing results, storage data shapes. Lightweight (2kb). |

### Not Needed in Phase 1

| Library | Why Deferred |
|---------|-------------|
| Vercel AI SDK (`ai`) | No LLM calls in Phase 1 |
| @ai-sdk/openai, @ai-sdk/anthropic | No LLM provider integration in Phase 1 |
| diff, diff2html | No diff parsing in Phase 1 |

**Installation (Phase 1):**
```bash
# Initialize WXT project (if not already done)
npx wxt@latest init pep-review --template react

# Phase 1 dependencies
npm install zod
npm install -D @wxt-dev/module-react vitest
```

## Architecture Patterns

### Phase 1 Project Structure

```
entrypoints/
+-- background.ts                    # Service worker: auth management, SPA nav detection
+-- ado-pr.content/                  # Content script for Azure DevOps PR pages
|   +-- index.tsx                    # Entry: SPA detection, button injection
|   +-- style.css                    # Scoped styles for shadow root UI
|   +-- components/
|   |   +-- ReviewButton.tsx         # The injected review button component
|   +-- App.tsx                      # React root component
+-- popup/                           # Extension popup (minimal in Phase 1)
|   +-- index.html
|   +-- main.tsx
|   +-- App.tsx                      # Popup with auth status display
+-- options/                         # Options page (PAT entry in Phase 1)
|   +-- index.html
|   +-- main.tsx
|   +-- App.tsx                      # PAT entry form
lib/
+-- url-matcher.ts                   # Azure DevOps URL parsing utility
+-- selectors.ts                     # ALL DOM selectors in one file
+-- auth/
|   +-- session.ts                   # Session cookie auth via service worker
|   +-- pat.ts                       # PAT storage and header generation
|   +-- manager.ts                   # Auth manager: session-first, PAT fallback
shared/
+-- types.ts                         # Shared type definitions
+-- messages.ts                      # Typed message definitions
+-- storage.ts                       # Storage key definitions and helpers
+-- constants.ts                     # URL patterns, API base URLs
wxt.config.ts                        # WXT configuration with manifest overrides
```

### Pattern 1: WXT File-Based Content Script Entrypoint

**What:** Define content scripts as files in the `entrypoints/` directory. WXT reads the `defineContentScript` options and auto-generates the manifest `content_scripts` entry.
**When to use:** Every content script in the extension.
**Confidence:** HIGH (verified in WXT official docs)

```typescript
// entrypoints/ado-pr.content/index.tsx
// Source: https://wxt.dev/guide/essentials/content-scripts.html
import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';

export default defineContentScript({
  matches: ['*://dev.azure.com/*/pullrequest/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Inject UI on initial load if we're on a PR page
    if (isPullRequestUrl(window.location.href)) {
      await mountReviewButton(ctx);
    }

    // Listen for SPA navigation
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl }) => {
      if (isPullRequestUrl(newUrl.toString())) {
        await mountReviewButton(ctx);
      }
    });
  },
});
```

### Pattern 2: createShadowRootUi with React

**What:** Use WXT's `createShadowRootUi` to inject a React component into the Azure DevOps page inside a Shadow DOM. Styles are completely isolated -- Azure DevOps CSS cannot affect the button and the button CSS cannot leak into Azure DevOps.
**When to use:** Every UI element injected into the host page.
**Confidence:** HIGH (verified in WXT official docs)

```typescript
// Source: https://wxt.dev/guide/key-concepts/content-script-ui.html
import ReactDOM from 'react-dom/client';
import ReviewButton from './components/ReviewButton';
import { SELECTORS } from '@/lib/selectors';

async function mountReviewButton(ctx: ContentScriptContext) {
  const ui = await createShadowRootUi(ctx, {
    name: 'pep-review-button',
    position: 'inline',
    anchor: SELECTORS.PR_HEADER_ACTIONS,  // centralized selector
    cssInjectionMode: 'ui',
    onMount: (container) => {
      const wrapper = document.createElement('div');
      container.append(wrapper);
      const root = ReactDOM.createRoot(wrapper);
      root.render(<ReviewButton />);
      return root;
    },
    onRemove: (root) => {
      root?.unmount();
    },
  });

  ui.mount();
}
```

**Key options:**
- `name`: Unique identifier for the shadow host element
- `position: 'inline'`: Button flows in the normal document next to the anchor
- `anchor`: CSS selector or element where the UI is inserted. Use centralized selectors.
- `cssInjectionMode: 'ui'`: CSS imported in the content script is automatically injected into the shadow root (not the page)
- `onMount`: Receives the container inside the shadow root. Returns a value passed to `onRemove` for cleanup.
- `onRemove`: Called when `ui.remove()` is invoked. Unmount React here.

### Pattern 3: SPA Navigation via wxt:locationchange

**What:** WXT fires a custom `wxt:locationchange` event when the URL changes without a full page reload. Internally, WXT polls `location.href` every ~1 second. The event provides `newUrl` and `oldUrl` properties.
**When to use:** Detecting when the user navigates to/from PR pages within Azure DevOps SPA.
**Confidence:** HIGH (verified in WXT official docs and GitHub issue #1567)

```typescript
// Source: https://wxt.dev/guide/essentials/content-scripts.html
import { MatchPattern } from 'wxt/sandbox';

const prPattern = new MatchPattern('*://dev.azure.com/*/pullrequest/*');

export default defineContentScript({
  matches: ['*://dev.azure.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Handle initial page load
    if (prPattern.includes(window.location.href)) {
      await mountReviewButton(ctx);
    }

    // Handle SPA navigation
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl, oldUrl }) => {
      const wasOnPR = prPattern.includes(oldUrl.toString());
      const isOnPR = prPattern.includes(newUrl.toString());

      if (isOnPR && !wasOnPR) {
        // Navigated TO a PR page
        await mountReviewButton(ctx);
      } else if (!isOnPR && wasOnPR) {
        // Navigated AWAY from a PR page
        removeReviewButton();
      } else if (isOnPR && wasOnPR) {
        // Navigated between different PRs
        removeReviewButton();
        await mountReviewButton(ctx);
      }
    });
  },
});
```

**Current limitation:** The `wxt:locationchange` event is powered by URL polling (~1 second interval). This means up to 1 second delay before the event fires. WXT issue #1567 proposes replacing this with history API monkeypatching for instant detection, but this is not yet implemented. The 1-second delay is acceptable for this use case.

### Pattern 4: Centralized DOM Selectors

**What:** All CSS selectors for targeting Azure DevOps DOM elements live in a single file. When Azure DevOps updates break selectors, only this file needs updating.
**When to use:** Every DOM query targeting the host page.
**Confidence:** HIGH (best practice from PITFALLS.md research)

```typescript
// lib/selectors.ts

/**
 * All Azure DevOps DOM selectors in one place.
 * When selectors break after an ADO update, update ONLY this file.
 *
 * Strategy:
 * 1. Prefer data-* attributes and aria-* attributes (more stable)
 * 2. Use semantic HTML element types as fallbacks
 * 3. Multiple selectors per target, tried in order
 */
export const SELECTORS = {
  /** Container for the PR header action buttons area */
  PR_HEADER_ACTIONS: [
    '.repos-pr-header-actions',          // Primary: known class
    '[data-focuszone-id] .bolt-header-command-bar', // Fallback: Bolt UI pattern
    '.page-content .bolt-header-commandbar',        // Fallback: broader search
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
 */
export function querySelector(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Health check: log warnings for selectors that match nothing.
 * Call on content script init to detect broken selectors early.
 */
export function checkSelectorHealth(): void {
  for (const [name, selectors] of Object.entries(SELECTORS)) {
    const found = querySelector(selectors as readonly string[]);
    if (!found) {
      console.warn(`[PEP Review] Selector "${name}" matched no elements. Azure DevOps UI may have updated.`);
    }
  }
}
```

### Pattern 5: Session-First Auth with PAT Fallback

**What:** Authenticate with Azure DevOps REST API using the browser's existing session cookies first. If session auth fails (401/403), fall back to a user-provided PAT stored in `chrome.storage.local`.
**When to use:** Every Azure DevOps API call.
**Confidence:** MEDIUM-HIGH (session cookie approach verified across multiple sources; exact cookie behavior in service workers requires testing)

```typescript
// lib/auth/manager.ts

export interface AuthResult {
  method: 'session' | 'pat';
  headers: Record<string, string>;
}

export async function getAuthHeaders(
  orgUrl: string
): Promise<AuthResult | null> {
  // 1. Try session-based auth
  const sessionResult = await trySessionAuth(orgUrl);
  if (sessionResult) return sessionResult;

  // 2. Fall back to PAT
  const patResult = await tryPatAuth();
  if (patResult) return patResult;

  // 3. No auth available
  return null;
}

// lib/auth/session.ts

/**
 * Attempt to make an authenticated request using the browser's session.
 * Service worker fetch with credentials: 'include' sends cookies
 * for domains in host_permissions.
 */
export async function trySessionAuth(
  orgUrl: string
): Promise<AuthResult | null> {
  try {
    const testUrl = `${orgUrl}/_apis/connectionData`;
    const response = await fetch(testUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      return {
        method: 'session',
        headers: {},  // No extra headers needed; cookies are sent automatically
      };
    }

    return null;  // Session auth failed, try PAT
  } catch {
    return null;
  }
}

// lib/auth/pat.ts

/**
 * Attempt to authenticate using a stored PAT.
 * PAT is encoded as Basic auth: base64(':' + pat)
 */
export async function tryPatAuth(): Promise<AuthResult | null> {
  const { pat } = await chrome.storage.local.get('pat');
  if (!pat) return null;

  return {
    method: 'pat',
    headers: {
      'Authorization': `Basic ${btoa(':' + pat)}`,
    },
  };
}
```

### Pattern 6: Typed Message Passing

**What:** Content script communicates with service worker via typed messages. All message types defined in a shared file. Service worker has a handler registry.
**When to use:** Every content-script-to-service-worker interaction.
**Confidence:** HIGH (standard Chrome extension pattern, verified in ARCHITECTURE.md)

```typescript
// shared/messages.ts

export type Message =
  | { type: 'CHECK_AUTH'; payload: { orgUrl: string } }
  | { type: 'AUTH_STATUS'; payload: { authenticated: boolean; method: 'session' | 'pat' | 'none' } }
  | { type: 'SAVE_PAT'; payload: { pat: string } }
  | { type: 'PAT_SAVED'; payload: { success: boolean; error?: string } };

export type MessageType = Message['type'];
export type MessagePayload<T extends MessageType> = Extract<Message, { type: T }>['payload'];

// Type-safe message sender
export function sendMessage<T extends MessageType>(
  type: T,
  payload: MessagePayload<T>
): Promise<any> {
  return chrome.runtime.sendMessage({ type, payload });
}

// entrypoints/background.ts
export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (handler) {
      handler(message.payload, sender).then(sendResponse);
      return true; // Keep channel open for async
    }
  });
});
```

### Anti-Patterns to Avoid

- **Making API calls from content scripts:** Content scripts are subject to the page's CORS policy. All Azure DevOps API calls MUST go through the service worker where `host_permissions` grant CORS bypass. Even same-origin requests from the content script should be routed through the service worker for consistency.

- **Using global variables in the service worker:** Service workers can terminate after 30 seconds of idle. Any state stored in module-level variables is lost. Use `chrome.storage.session` (in-memory, survives restarts within browser session) or `chrome.storage.local` (persists to disk).

- **Injecting UI without Shadow DOM:** Azure DevOps has extensive CSS. Without Shadow DOM isolation, styles will clash in both directions. Always use `createShadowRootUi`.

- **Hardcoding DOM selectors throughout content script code:** Azure DevOps updates CSS class names frequently (every ~3 weeks). Centralize all selectors in `lib/selectors.ts`.

- **Using `setTimeout`/`setInterval` in the service worker:** These are canceled on service worker termination. Use `chrome.alarms` for timers that must survive termination.

- **Assuming content script runs once per page:** Azure DevOps is a SPA. The content script loads once but the user navigates between pages. Always handle re-injection via `wxt:locationchange`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shadow DOM creation + style isolation | Custom shadow root setup | WXT `createShadowRootUi` | Handles shadow root creation, CSS injection, React mounting, event isolation, cleanup. Doing this manually means reimplementing ~200 lines of boilerplate with edge cases around CSS loading order and `all: initial` resets. |
| SPA navigation detection | Custom `history.pushState` monkeypatch + `popstate` listener + `MutationObserver` | WXT `wxt:locationchange` event | WXT handles the polling internally. The alternative (monkeypatching + MutationObserver) requires MAIN world script injection, message passing to ISOLATED world, cleanup on invalidation -- easily 100+ lines with subtle bugs. |
| Manifest generation | Hand-written `manifest.json` | WXT auto-generation from entrypoint files | WXT reads `defineContentScript` options and generates the correct manifest. Manual manifest management leads to drift between code and manifest. |
| Content script context invalidation handling | Manual `try/catch` around every `chrome.*` API call | WXT `ctx.addEventListener`, `ctx.setTimeout`, etc. | When the extension updates, content scripts are invalidated. WXT's `ctx` wrapper automatically prevents "Extension context invalidated" errors. |
| URL pattern matching | Custom regex for Azure DevOps URLs | WXT `MatchPattern` class | WXT provides `MatchPattern` from `wxt/sandbox` that implements Chrome's match pattern spec. Handles edge cases (trailing slashes, query params, fragments). |

**Key insight:** WXT provides the entire content script lifecycle management that would otherwise require 500+ lines of custom code (shadow DOM, SPA detection, context invalidation, manifest generation). Using WXT correctly means Phase 1 can focus on the Azure DevOps-specific logic rather than plumbing.

## Common Pitfalls

### Pitfall 1: Service Worker Cookies Not Sent Automatically

**What goes wrong:** Developer assumes that having `host_permissions: ["https://dev.azure.com/*"]` means the service worker's `fetch()` calls to `dev.azure.com` will automatically include the user's session cookies. They make a fetch call without `credentials: 'include'`, get a 401 response, and conclude session auth doesn't work.
**Why it happens:** In regular web pages, same-origin fetch includes cookies by default. In extension service workers, the default credential mode for `fetch()` is `'same-origin'`, which means cookies are only sent for requests to the extension's own origin (`chrome-extension://...`). Requests to `dev.azure.com` are cross-origin from the service worker's perspective.
**How to avoid:** Always use `credentials: 'include'` on fetch calls to `dev.azure.com` from the service worker. The `host_permissions` declaration combined with `credentials: 'include'` causes Chrome to treat the request as same-site (allowing `SameSite=Strict` cookies) and include the cookies.
**Warning signs:** Session auth works in content script (same-origin) but fails in service worker. 401 responses from Azure DevOps despite the user being logged in.
**Confidence:** MEDIUM -- multiple credible sources agree on this behavior, but the exact nuance of service worker cookie handling varies by Chrome version and should be validated during implementation.

### Pitfall 2: wxt:locationchange Fires But DOM Not Ready

**What goes wrong:** The `wxt:locationchange` event fires when the URL changes, but the Azure DevOps SPA hasn't finished rendering the new page content yet. The content script tries to find the PR header to inject the button, but the DOM element doesn't exist yet.
**Why it happens:** URL change and DOM rendering are asynchronous. Azure DevOps may update the URL before the React components for the new page are mounted.
**How to avoid:** After receiving `wxt:locationchange`, use `autoMount()` from `createShadowRootUi` which internally uses a `MutationObserver` to wait for the anchor element to appear. Alternatively, implement a retry with `ctx.setTimeout` that checks for the anchor element every 200ms up to 5 seconds.
**Warning signs:** Button appears inconsistently -- sometimes shows up, sometimes doesn't on the same navigation path.

### Pitfall 3: Azure DevOps DOM Selectors Break on Updates

**What goes wrong:** Azure DevOps updates (every ~3 weeks) change compiled CSS class names. The extension's selectors stop matching, and the review button silently disappears.
**Why it happens:** Azure DevOps uses React with compiled/minified class names that are not part of any public API contract.
**How to avoid:** (1) Centralize all selectors in `lib/selectors.ts`. (2) Use multiple fallback selectors per target. (3) Prefer `data-*` attributes, `aria-*` attributes, and semantic HTML over class names. (4) Implement a selector health check that logs warnings when selectors match nothing. (5) Extract PR info from the URL (not the DOM) whenever possible.
**Warning signs:** Extension silently stops rendering UI after an Azure DevOps update.

### Pitfall 4: Content Script Match Pattern Too Narrow or Too Broad

**What goes wrong:** If the match pattern is `*://dev.azure.com/*/pullrequest/*`, the content script only loads on direct navigation to that URL pattern. But if the user navigates to Azure DevOps on a non-PR page first and then navigates to a PR via SPA, the content script was never injected. Conversely, `*://dev.azure.com/*` injects on every Azure DevOps page, which is wasteful.
**Why it happens:** The content script `matches` pattern determines when Chrome injects the script on full page loads. SPA navigations within Azure DevOps don't trigger re-injection.
**How to avoid:** Use `matches: ['*://dev.azure.com/*']` (broad) to ensure the content script is present on any Azure DevOps page. Then use `wxt:locationchange` + URL pattern matching to conditionally show/hide the review button only on PR pages. The content script itself is lightweight when idle on non-PR pages.
**Warning signs:** Button never appears when navigating from a non-PR Azure DevOps page to a PR page without a full page reload.

### Pitfall 5: Multiple Shadow Roots on Re-navigation

**What goes wrong:** User navigates away from a PR page and back. The content script creates a second shadow root and review button. Now there are two buttons visible.
**Why it happens:** The `wxt:locationchange` handler creates new UI without checking if one already exists.
**How to avoid:** Track the current UI instance. Call `ui.remove()` before creating a new one. Or use `autoMount()` which handles mount/unmount lifecycle based on anchor presence automatically.
**Warning signs:** Duplicate buttons appearing after SPA navigation.

### Pitfall 6: PAT Stored Without Validation

**What goes wrong:** User enters an invalid string as a PAT. The extension stores it and silently fails on every API call.
**Why it happens:** No validation on PAT entry.
**How to avoid:** (1) Validate PAT format -- Azure DevOps PATs are 84 characters long with an `AZDO` signature at positions 76-80. (2) Make a test API call (`_apis/connectionData`) on PAT entry to verify it works. (3) Show clear success/failure feedback to the user.
**Warning signs:** Auth always fails with PAT, user doesn't understand why.

## Code Examples

### Complete Content Script Entry Point

```typescript
// entrypoints/ado-pr.content/index.tsx
// Source: WXT docs (https://wxt.dev/guide/essentials/content-scripts.html)
//         + WXT Content Script UI docs (https://wxt.dev/guide/key-concepts/content-script-ui.html)

import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { querySelector, checkSelectorHealth, SELECTORS } from '@/lib/selectors';
import { parsePrUrl, isPullRequestUrl } from '@/lib/url-matcher';

let currentUi: ReturnType<typeof createShadowRootUi> | null = null;

export default defineContentScript({
  matches: ['*://dev.azure.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Check if we're on a PR page on initial load
    if (isPullRequestUrl(window.location.href)) {
      await tryMount(ctx);
    }

    // Handle SPA navigation
    ctx.addEventListener(window, 'wxt:locationchange', async ({ newUrl, oldUrl }) => {
      const newUrlStr = newUrl.toString();
      const oldUrlStr = oldUrl.toString();

      if (isPullRequestUrl(newUrlStr)) {
        // Clean up any existing UI first
        if (currentUi) {
          currentUi.remove();
          currentUi = null;
        }
        await tryMount(ctx);
      } else if (isPullRequestUrl(oldUrlStr) && currentUi) {
        // Left a PR page
        currentUi.remove();
        currentUi = null;
      }
    });
  },
});

async function tryMount(ctx: ContentScriptContext) {
  // Wait for the PR page to render (DOM may not be ready yet)
  const anchor = await waitForElement(ctx, SELECTORS.PR_HEADER_ACTIONS, 5000);
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
    onMount: (container) => {
      const wrapper = document.createElement('div');
      container.append(wrapper);
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

/**
 * Wait for a DOM element to appear, with timeout.
 * Uses MutationObserver internally for efficiency.
 */
function waitForElement(
  ctx: ContentScriptContext,
  selectors: readonly string[],
  timeoutMs: number
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check immediately
    const existing = querySelector(selectors);
    if (existing) {
      resolve(existing);
      return;
    }

    // Set up observer
    const observer = new MutationObserver(() => {
      const el = querySelector(selectors);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout
    ctx.setTimeout(() => {
      observer.disconnect();
      resolve(querySelector(selectors)); // One last try
    }, timeoutMs);
  });
}
```

### URL Matcher Utility

```typescript
// lib/url-matcher.ts

export interface PrInfo {
  org: string;
  project: string;
  repo: string;
  prId: number;
  baseUrl: string;  // https://dev.azure.com/{org}/{project}
}

/**
 * Parse an Azure DevOps PR URL into its components.
 * Pattern: dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
 */
const PR_URL_REGEX = /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/;

export function parsePrUrl(url: string): PrInfo | null {
  const match = url.match(PR_URL_REGEX);
  if (!match) return null;

  const [, org, project, repo, prIdStr] = match;
  const prId = parseInt(prIdStr, 10);
  if (isNaN(prId)) return null;

  return {
    org,
    project,
    repo,
    prId,
    baseUrl: `https://dev.azure.com/${org}/${project}`,
  };
}

export function isPullRequestUrl(url: string): boolean {
  return PR_URL_REGEX.test(url);
}
```

### WXT Configuration

```typescript
// wxt.config.ts
// Source: https://wxt.dev/guide/essentials/entrypoints.html

import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PEP Review',
    description: 'AI-powered code review for Azure DevOps pull requests',
    permissions: [
      'storage',
      'cookies',
    ],
    host_permissions: [
      'https://dev.azure.com/*',
      'https://*.visualstudio.com/*',
    ],
    // LLM API host_permissions deferred to Phase 2/3
  },
});
```

### Service Worker Background Script

```typescript
// entrypoints/background.ts
// Source: Chrome Extension docs (https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

import { getAuthHeaders, AuthResult } from '@/lib/auth/manager';

export default defineBackground(() => {
  // Message handler registry
  const handlers: Record<string, (payload: any, sender: chrome.runtime.MessageSender) => Promise<any>> = {
    CHECK_AUTH: handleCheckAuth,
    SAVE_PAT: handleSavePat,
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];
    if (handler) {
      handler(message.payload, sender).then(sendResponse);
      return true; // Keep channel open for async response
    }
  });
});

async function handleCheckAuth(
  payload: { orgUrl: string }
): Promise<{ authenticated: boolean; method: 'session' | 'pat' | 'none' }> {
  const auth = await getAuthHeaders(payload.orgUrl);
  if (auth) {
    return { authenticated: true, method: auth.method };
  }
  return { authenticated: false, method: 'none' };
}

async function handleSavePat(
  payload: { pat: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate PAT format (84 chars, AZDO signature)
    if (payload.pat.length !== 84) {
      return { success: false, error: 'PAT must be 84 characters long' };
    }

    // Test the PAT against Azure DevOps
    const testResponse = await fetch('https://dev.azure.com/_apis/connectionData', {
      headers: {
        'Authorization': `Basic ${btoa(':' + payload.pat)}`,
        'Accept': 'application/json',
      },
    });

    if (!testResponse.ok) {
      return { success: false, error: `PAT validation failed: ${testResponse.status}` };
    }

    // Store the PAT
    await chrome.storage.local.set({ pat: payload.pat });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### Auth Module: Session Cookie Fetch from Service Worker

```typescript
// lib/auth/session.ts
// Source: Chrome docs on storage-and-cookies
//   (https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
// + Chrome docs on network-requests
//   (https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

/**
 * Test if the user's browser session can authenticate with Azure DevOps.
 *
 * CRITICAL: Must use credentials: 'include' -- cookies are NOT sent
 * automatically from service workers even with host_permissions.
 *
 * host_permissions for dev.azure.com makes the request "same-site"
 * (SameSite=Strict cookies are included), but the credentials mode
 * must be explicitly set.
 */
export async function testSessionAuth(orgUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${orgUrl}/_apis/connectionData`, {
      method: 'GET',
      credentials: 'include',  // REQUIRED for cookies
      headers: {
        'Accept': 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Make an authenticated fetch to Azure DevOps using session cookies.
 */
export async function sessionFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',  // Always include cookies
    headers: {
      'Accept': 'application/json',
      ...options.headers,
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manifest V2 persistent background pages | Manifest V3 service workers (event-driven, terminable) | Chrome enforced MV3, MV2 disabled 2024-2025 | Service workers terminate after 30s idle. No global state. Must use chrome.storage. |
| `webextension-polyfill` for cross-browser | `@types/chrome` directly | WXT v0.20 dropped polyfill | More accurate MV3 types, fewer bugs, smaller bundle |
| Azure DevOps OAuth app registration | Microsoft Entra ID (Azure AD) | April 2025 (no new OAuth apps) | Do NOT build on Azure DevOps OAuth. Use session cookies + PAT fallback. |
| Manual `history.pushState` monkeypatching for SPA detection | WXT `wxt:locationchange` event | WXT v0.18+ (current: v0.20) | WXT handles polling internally. Issue #1567 may improve to instant detection via script injection. |
| `createShadowRootUi` with `all: initial` default | Same, with `inheritStyles` option added | WXT v0.20 | Styles are reset by default. Use `inheritStyles: true` only if you want page styles to affect your UI. |

**Deprecated/outdated:**
- **Azure DevOps OAuth:** Full deprecation scheduled 2026. Do not use. Session cookies + PAT is the forward-compatible approach for browser extensions.
- **`webextension-polyfill`:** Dropped by WXT v0.20. Causes type conflicts if added back.
- **MV2 background pages:** Disabled by Chrome. Service workers are mandatory.

## Open Questions

1. **Service Worker Cookie Behavior Varies by Chrome Version**
   - What we know: Multiple sources confirm `credentials: 'include'` is needed for service worker fetch to include cookies. Chrome docs state requests from service workers with `host_permissions` are treated as "same-site."
   - What's unclear: Whether Chrome version differences (114-130+) affect cookie inclusion behavior. Some Chromium forum posts suggest inconsistencies.
   - Recommendation: Implement with `credentials: 'include'`, test on target Chrome version, and ensure PAT fallback works reliably as a safety net.

2. **Exact Azure DevOps DOM Selectors for Button Injection**
   - What we know: Azure DevOps uses Bolt UI library with classes like `bolt-header-command-bar`, `repos-pr-*`. These are NOT stable APIs.
   - What's unclear: The exact current selectors for the PR page header action area. These change with Azure DevOps sprint updates (~every 3 weeks).
   - Recommendation: During implementation, inspect the live Azure DevOps PR page in DevTools and document current selectors in `lib/selectors.ts`. Use multiple fallback selectors. Prefer `data-*` and `aria-*` attributes over class names.

3. **WXT `autoMount()` vs Manual MutationObserver for Dynamic Anchors**
   - What we know: WXT's `createShadowRootUi` supports `autoMount()` which internally uses MutationObserver to wait for the anchor element. Manual implementation with `waitForElement` also works.
   - What's unclear: Whether `autoMount()` correctly handles the case where the anchor is removed and re-added (SPA re-render) vs creating duplicate UIs.
   - Recommendation: Start with manual `waitForElement` approach (more control), consider migrating to `autoMount()` if it proves robust during testing.

4. **Azure DevOps Session Token Endpoint**
   - What we know: There's a `/_apis/WebPlatformAuth/SessionToken` endpoint that returns a session token. This could be an alternative to cookie-based auth.
   - What's unclear: Whether this endpoint is accessible from a Chrome extension context, its authentication requirements, and its stability/deprecation status.
   - Recommendation: Use cookie-based session auth as primary. If it fails due to cookie partitioning or corporate policies, investigate the SessionToken endpoint as a middle ground before PAT fallback.

## Sources

### Primary (HIGH confidence)
- [WXT Content Scripts Guide](https://wxt.dev/guide/essentials/content-scripts.html) -- defineContentScript API, wxt:locationchange, ctx object, CSS injection modes
- [WXT Content Script UI Guide](https://wxt.dev/guide/key-concepts/content-script-ui.html) -- createShadowRootUi, createIntegratedUi, autoMount, React patterns
- [WXT Entrypoints Guide](https://wxt.dev/guide/essentials/entrypoints.html) -- File-based entrypoints, naming conventions, manifest auto-generation
- [WXT BaseContentScriptEntrypointOptions API](https://wxt.dev/api/reference/wxt/interfaces/basecontentscriptentrypointoptions) -- Complete API reference for content script options
- [Chrome Cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies) -- chrome.cookies.getAll, permission requirements
- [Chrome Cross-Origin Network Requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) -- host_permissions CORS bypass, service worker vs content script
- [Chrome Storage and Cookies in Extensions](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies) -- Cookie partitioning, same-site treatment with host_permissions
- [Chromium Content Script Fetch Changes](https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/) -- Content scripts subject to page CORS since Chrome 85
- [Azure DevOps PAT Authentication](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops) -- Basic auth header format, PAT format (84 chars, AZDO signature)
- [Azure DevOps Authentication Guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops) -- OAuth deprecated, Entra ID recommended, PAT still supported

### Secondary (MEDIUM confidence)
- [WXT GitHub Issue #1567 - Improved wxt:locationchange](https://github.com/wxt-dev/wxt/issues/1567) -- Current polling behavior, proposed monkeypatch improvement
- [WXT DeepWiki - Content Script UI](https://deepwiki.com/wxt-dev/wxt/5.3-content-script-ui) -- createShadowRootUi details, autoMount API
- [WXT DeepWiki - Content Scripts](https://deepwiki.com/wxt-dev/wxt/5.2-content-scripts) -- World property, registration modes
- [SPA Navigation Detection for Chrome Extensions (Medium)](https://medium.com/@softvar/making-chrome-extension-smart-by-supporting-spa-websites-1f76593637e8) -- MutationObserver + webNavigation patterns
- [Building AI Browser Extensions with WXT (Marmelab)](https://marmelab.com/blog/2025/04/15/browser-extension-form-ai-wxt.html) -- Real-world WXT extension implementation
- [Chrome Extension Cookie Behavior in Service Workers (Chromium Groups)](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/RMUtNEhR0R8) -- Cookies not automatically included in service worker fetch

### Tertiary (LOW confidence)
- Azure DevOps DOM selectors (`repos-pr-*`, `bolt-*`) -- Based on community reports and inspection; NOT stable; must be verified against live page during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- WXT, TypeScript, React are decided in project STACK.md with extensive prior research
- Architecture patterns: HIGH -- WXT's createShadowRootUi and wxt:locationchange are well-documented official features
- SPA detection: HIGH -- WXT handles this; limitation (1s polling) is documented and acceptable
- Session auth: MEDIUM -- Multiple sources agree on `credentials: 'include'` approach, but service worker cookie behavior has version-specific nuances that need testing
- DOM selectors: LOW -- Azure DevOps DOM is not a public API; selectors must be determined from live inspection and will require ongoing maintenance
- Pitfalls: HIGH -- Verified against official Chrome docs and project PITFALLS.md research

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (30 days -- WXT is stable; Azure DevOps DOM may change sooner)
