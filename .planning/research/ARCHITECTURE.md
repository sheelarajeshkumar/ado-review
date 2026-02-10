# Architecture Research

**Domain:** Chrome Extension (Manifest V3) -- AI Code Review on Azure DevOps
**Researched:** 2026-02-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+-----------------------------------------------------------------------+
|                        Chrome Extension                                |
|                                                                        |
|  +------------------+     messages      +-------------------------+   |
|  |  Content Script  | <--------------> |    Service Worker        |   |
|  |  (per ADO tab)   |  chrome.runtime  |    (background.ts)       |   |
|  |                  |                  |                         |   |
|  |  - URL detection |                  |  - API orchestration    |   |
|  |  - DOM injection |                  |  - Azure DevOps REST    |   |
|  |  - UI rendering  |                  |  - LLM API calls        |   |
|  |  - Shadow DOM    |                  |  - Auth management      |   |
|  +--------+---------+                  +-----+--------+----------+   |
|           |                                  |        |              |
|           |                            +-----+--+ +---+--------+    |
|           |                            | chrome | | chrome     |    |
|           |                            |.storage| | .identity  |    |
|           |                            +--------+ +------------+    |
|                                                                      |
|  +------------------+     +-------------------+                      |
|  |  Options Page    |     |  Popup (optional)  |                     |
|  |  (settings UI)   |     |  (quick status)    |                     |
|  |                  |     |                   |                      |
|  |  - API keys      |     |  - Review status   |                     |
|  |  - LLM config    |     |  - Quick actions    |                     |
|  |  - Prompt tuning |     +-------------------+                      |
|  +------------------+                                                |
+-----------------------------------------------------------------------+
           |                                  |                |
           |                                  |                |
     Azure DevOps DOM                  Azure DevOps        LLM APIs
     (injected UI)                     REST API v7.1     (OpenAI, Anthropic,
                                                          Azure OpenAI)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Content Script** | Detects PR pages on dev.azure.com, injects review button and results UI into the Azure DevOps DOM, relays user actions to service worker | TypeScript, injected at `document_idle` on `*://dev.azure.com/*` match patterns. Renders inside Shadow DOM for style isolation. |
| **Service Worker** | Central orchestrator. Receives review requests from content script, fetches PR data from Azure DevOps REST API, sends code to LLM APIs, returns structured review results. Manages auth tokens. | TypeScript, event-driven. All external API calls happen here (avoids CORS issues in content scripts). |
| **Options Page** | Full settings UI for API keys, LLM provider selection, model configuration, custom prompts, and auth setup (PAT entry) | React + TypeScript, rendered as standalone page. Reads/writes `chrome.storage.local`. |
| **Popup** (optional) | Lightweight status indicator and quick actions (e.g., "Review this PR" shortcut, last review status) | React + TypeScript, small footprint. Communicates with service worker via messages. |
| **Storage Layer** | Persists settings (API keys, prompts, preferences) and transient state (active review status, cached results) | `chrome.storage.local` for persistent config, `chrome.storage.session` for sensitive tokens and transient state. |

## Recommended Project Structure

```
src/
+-- manifest.json              # Extension manifest (Manifest V3)
+-- background/
|   +-- service-worker.ts      # Main service worker entry
|   +-- messages.ts            # Message handler registry
|   +-- api/
|   |   +-- azure-devops.ts    # Azure DevOps REST API client
|   |   +-- llm/
|   |   |   +-- provider.ts    # LLM provider interface
|   |   |   +-- openai.ts      # OpenAI implementation
|   |   |   +-- anthropic.ts   # Anthropic implementation
|   |   |   +-- azure-openai.ts # Azure OpenAI implementation
|   |   +-- auth.ts            # Auth management (session + PAT)
|   +-- review/
|       +-- orchestrator.ts    # Review workflow coordination
|       +-- diff-parser.ts     # Parse PR diffs into reviewable chunks
|       +-- prompt-builder.ts  # Build LLM prompts from diffs
|       +-- comment-mapper.ts  # Map LLM output to PR comment positions
+-- content/
|   +-- index.ts               # Content script entry point
|   +-- detector.ts            # PR page URL/DOM detection
|   +-- injector.ts            # Shadow DOM host creation + UI mount
|   +-- components/
|   |   +-- ReviewButton.tsx   # "Run AI Review" button
|   |   +-- ReviewPanel.tsx    # Results panel (inline + summary)
|   |   +-- StatusIndicator.tsx # Review progress indicator
|   +-- styles/
|       +-- content.css        # Styles scoped to Shadow DOM
+-- options/
|   +-- index.html             # Options page shell
|   +-- Options.tsx            # Options React root
|   +-- components/
|       +-- ApiKeyForm.tsx     # API key entry per provider
|       +-- PromptEditor.tsx   # Custom prompt configuration
|       +-- ModelSelector.tsx  # Model and provider selection
|       +-- AuthConfig.tsx     # PAT and session auth settings
+-- popup/
|   +-- index.html             # Popup shell
|   +-- Popup.tsx              # Popup React root
+-- shared/
|   +-- types.ts               # Shared type definitions
|   +-- messages.ts            # Message type constants + helpers
|   +-- storage.ts             # Storage read/write helpers
|   +-- constants.ts           # URL patterns, API endpoints
+-- lib/
    +-- shadow-dom.ts          # Shadow DOM creation utility
    +-- url-matcher.ts         # Azure DevOps URL parsing
```

### Structure Rationale

- **background/:** All service worker code isolated here. The `api/` subfolder separates external API concerns (Azure DevOps, LLMs, auth). The `review/` subfolder encapsulates the core review workflow logic. This separation matters because service worker code has unique constraints (no DOM, termination resilience).
- **content/:** Everything that touches the host page DOM. Components are React rendered into Shadow DOM. Kept minimal -- the content script should be thin, delegating all logic to the service worker.
- **options/ and popup/:** Separate entry points, each with their own HTML shell and React root. These are independent pages Chrome opens in their own contexts.
- **shared/:** Types and utilities used across all contexts (content script, service worker, options page). Message type definitions live here to ensure type safety across the message boundary.
- **lib/:** Pure utility functions with no Chrome API dependencies. Easier to unit test.

## Architectural Patterns

### Pattern 1: Message-Based Command Pattern

**What:** All communication between content script and service worker uses typed message objects with a `type` discriminator. The service worker has a message handler registry that routes messages to the correct handler function.
**When to use:** Every interaction between content script and service worker.
**Trade-offs:** Adds boilerplate for message types, but provides type safety across the process boundary and makes the system testable (handlers can be unit tested without Chrome APIs).

**Example:**
```typescript
// shared/messages.ts
type Message =
  | { type: 'START_REVIEW'; payload: { prUrl: string } }
  | { type: 'REVIEW_PROGRESS'; payload: { step: string; progress: number } }
  | { type: 'REVIEW_COMPLETE'; payload: { comments: ReviewComment[] } }
  | { type: 'REVIEW_ERROR'; payload: { error: string } }
  | { type: 'GET_SETTINGS'; payload: {} }
  | { type: 'SETTINGS_RESULT'; payload: Settings };

// background/messages.ts
const handlers: Record<string, (msg: any, sender: any) => Promise<any>> = {
  START_REVIEW: handleStartReview,
  GET_SETTINGS: handleGetSettings,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message.type];
  if (handler) {
    handler(message, sender).then(sendResponse);
    return true; // keep channel open for async response
  }
});
```

### Pattern 2: Shadow DOM Isolation for Injected UI

**What:** Create a Shadow DOM root attached to a host element injected into the Azure DevOps page. All extension UI renders inside this shadow root. Styles are scoped and cannot leak in or out.
**When to use:** Every UI element injected into the Azure DevOps page.
**Trade-offs:** Slightly more complex setup (CSS must be inlined or fetched into shadow root), but absolutely necessary to prevent style conflicts with Azure DevOps's CSS. Without this, the host page CSS will break the extension UI and vice versa.

**Example:**
```typescript
// lib/shadow-dom.ts
export function createShadowHost(
  parentSelector: string,
  hostId: string
): ShadowRoot {
  const parent = document.querySelector(parentSelector);
  if (!parent) throw new Error(`Parent not found: ${parentSelector}`);

  const host = document.createElement('div');
  host.id = hostId;
  parent.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject scoped styles
  const style = document.createElement('style');
  style.textContent = EXTENSION_CSS; // bundled at build time
  shadow.appendChild(style);

  // Create React mount point
  const root = document.createElement('div');
  root.id = 'pep-review-root';
  shadow.appendChild(root);

  return shadow;
}
```

### Pattern 3: SPA Navigation Detection

**What:** Azure DevOps is a single-page application. Traditional content script injection (on page load) only fires once. Use `chrome.webNavigation.onHistoryStateUpdated` in the service worker to detect SPA navigation, then programmatically re-inject or notify the content script.
**When to use:** Detecting when the user navigates to/from PR pages within Azure DevOps without a full page reload.
**Trade-offs:** Requires the `webNavigation` permission. Adds complexity but is essential -- without it, the extension only works on the first page load and breaks on subsequent SPA navigations.

**Example:**
```typescript
// background/service-worker.ts
chrome.webNavigation.onHistoryStateUpdated.addListener(
  async (details) => {
    if (isPullRequestUrl(details.url)) {
      // Notify content script that we're on a PR page
      chrome.tabs.sendMessage(details.tabId, {
        type: 'PR_PAGE_DETECTED',
        payload: { url: details.url, prInfo: parsePrUrl(details.url) }
      });
    }
  },
  { url: [{ hostSuffix: 'dev.azure.com' }] }
);

// content/index.ts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PR_PAGE_DETECTED') {
    injectReviewButtonIfNeeded(message.payload.prInfo);
  }
});
```

### Pattern 4: Service Worker Keep-Alive for Long LLM Calls

**What:** LLM API calls can take 30-120+ seconds. The service worker terminates after 30 seconds of idle or 5 minutes total. Use a long-lived port connection from the content script to keep the service worker alive during review processing.
**When to use:** During the active review process when waiting for LLM API responses.
**Trade-offs:** Adds connection management complexity. The port must be opened before the review starts and closed after completion. If the content script tab is closed mid-review, the port disconnects and the service worker may terminate -- handle gracefully by persisting partial state.

**Example:**
```typescript
// content/index.ts -- when starting a review
const port = chrome.runtime.connect({ name: 'review-keepalive' });
port.postMessage({ type: 'START_REVIEW', payload: { prUrl } });

port.onMessage.addListener((msg) => {
  if (msg.type === 'REVIEW_PROGRESS') updateProgressUI(msg.payload);
  if (msg.type === 'REVIEW_COMPLETE') {
    showResults(msg.payload);
    port.disconnect();
  }
});

// background/service-worker.ts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'review-keepalive') {
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'START_REVIEW') {
        await executeReview(msg.payload, (progress) => {
          port.postMessage({ type: 'REVIEW_PROGRESS', payload: progress });
        });
      }
    });
  }
});
```

## Data Flow

### Primary Review Flow

```
User clicks "Run AI Review" button in Azure DevOps PR page
    |
    v
[Content Script] opens long-lived port to service worker
    |
    | port.postMessage({ type: 'START_REVIEW', prUrl })
    v
[Service Worker] receives request, begins orchestration
    |
    +---> [Auth Manager] retrieves Azure DevOps credentials
    |     |
    |     +-- Check chrome.storage.session for session token
    |     +-- Fallback to chrome.storage.local for PAT
    |     |
    |     v
    +---> [Azure DevOps API Client] fetches PR data
    |     |
    |     +-- GET /pullRequests/{id} .............. PR metadata
    |     +-- GET /pullRequests/{id}/iterations ... iteration list
    |     +-- GET /iterations/{id}/changes ........ changed files
    |     +-- GET /items?path={filePath} .......... file contents
    |     |
    |     v
    +---> [Diff Parser] processes changes into reviewable chunks
    |     |
    |     +-- Group changes by file
    |     +-- Extract before/after content with line numbers
    |     +-- Chunk large files to fit LLM context windows
    |     |
    |     v
    +---> [Prompt Builder] constructs LLM prompts
    |     |
    |     +-- Load custom prompt template from storage
    |     +-- Inject diff context, file metadata, PR description
    |     +-- Format per LLM provider requirements
    |     |
    |     v
    +---> [LLM Provider] sends review request (progress updates via port)
    |     |
    |     +-- POST to OpenAI / Anthropic / Azure OpenAI endpoint
    |     +-- Parse structured response (file, line, comment, severity)
    |     |
    |     v
    +---> [Comment Mapper] maps LLM output to Azure DevOps positions
    |     |
    |     +-- Convert LLM line references to threadContext positions
    |     +-- Build rightFileStart/rightFileEnd CommentPosition objects
    |     +-- Generate summary comment from aggregated findings
    |     |
    |     v
    +---> [Azure DevOps API Client] posts comments back to PR
    |     |
    |     +-- POST /pullRequests/{id}/threads (per inline comment)
    |     +-- POST /pullRequests/{id}/threads (summary comment)
    |     |
    |     v
    +---> port.postMessage({ type: 'REVIEW_COMPLETE', comments })
          |
          v
[Content Script] updates UI with results, disconnects port
```

### Settings Flow

```
[Options Page]
    |
    | chrome.storage.local.set({ apiKeys, prompts, preferences })
    v
[chrome.storage.local] ---- onChanged event ---->  [Service Worker]
                       \                               (reloads config)
                        \
                         +-- onChanged event ---->  [Content Script]
                                                    (updates UI state)
```

### Auth Flow (Session-First with PAT Fallback)

```
[Service Worker] needs Azure DevOps credentials
    |
    +---> Check chrome.storage.session for cached session cookie/token
    |     |
    |     +-- Found and valid? --> Use it
    |     +-- Not found?
    |         |
    |         v
    +---> Check chrome.storage.local for PAT
    |     |
    |     +-- Found? --> Use PAT in Authorization header
    |     +-- Not found?
    |         |
    |         v
    +---> Notify content script: "AUTH_REQUIRED"
          |
          v
    [Content Script] shows auth prompt / redirects to options page
```

### Key Data Flows

1. **Review Request:** Content script -> (port message) -> Service worker -> Azure DevOps API -> Diff Parser -> Prompt Builder -> LLM API -> Comment Mapper -> Azure DevOps API -> (port message) -> Content script UI update.
2. **Settings Change:** Options page -> chrome.storage.local -> onChanged event -> Service worker + Content script reactively update.
3. **SPA Navigation:** Azure DevOps SPA navigates -> chrome.webNavigation.onHistoryStateUpdated fires -> Service worker notifies content script -> Content script injects/removes UI as needed.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user (v1) | All processing in service worker. One LLM call per file chunk. Sequential comment posting. No caching. |
| Power user (v1.5) | Parallel LLM calls per file (Promise.all with concurrency limit). Cache PR diff data in chrome.storage.session to avoid re-fetching on re-review. Batch comment posting. |
| Team adoption (v2) | Consider shared prompt templates. Rate limit awareness per LLM provider. Review result caching keyed by PR iteration to avoid duplicate reviews. |

### Scaling Priorities

1. **First bottleneck: LLM latency.** Large PRs with many files will take a long time if reviewed sequentially. Parallelize LLM calls per file with a concurrency cap (3-5 simultaneous). This is the single biggest performance lever.
2. **Second bottleneck: Azure DevOps API rate limits.** Fetching file contents one at a time is slow. Batch requests where the API supports it. Cache aggressively within a session.

## Anti-Patterns

### Anti-Pattern 1: Making API Calls from the Content Script

**What people do:** Call Azure DevOps or LLM APIs directly from the content script using fetch().
**Why it is wrong:** Content scripts are subject to the page's CORS policy, not the extension's host_permissions. Calls will fail or require unsafe workarounds. Also mixes concerns -- the content script should only handle DOM.
**Do this instead:** All external API calls go through the service worker. Content script sends a message; service worker makes the fetch and returns the result.

### Anti-Pattern 2: Storing API Keys in chrome.storage.sync

**What people do:** Store LLM API keys in sync storage so they "follow the user."
**Why it is wrong:** Sync storage syncs to Google's servers. API keys are sensitive credentials that should not leave the local machine. Sync storage also has low size limits (100KB total, 8KB per item).
**Do this instead:** Store API keys in `chrome.storage.local`. For extra security, consider encrypting at rest. Never expose keys to content scripts (keep storage access level as `TRUSTED_CONTEXTS`).

### Anti-Pattern 3: Using Global Variables in the Service Worker

**What people do:** Store review state, auth tokens, or configuration in module-level variables in the service worker.
**Why it is wrong:** The service worker can be terminated at any time (30s idle, 5min max). All global state is lost on termination. The next event will start a fresh service worker instance with no memory of previous state.
**Do this instead:** Persist all state to `chrome.storage.local` (durable) or `chrome.storage.session` (transient, in-memory but survives worker restarts within a browser session). Read state at the beginning of each handler.

### Anti-Pattern 4: Injecting UI Without Shadow DOM

**What people do:** Append extension UI elements directly to the host page DOM with class names and styles.
**Why it is wrong:** Azure DevOps has extensive CSS. Extension styles will leak into the page and vice versa. The extension UI will look different (or broken) after Azure DevOps updates their CSS. Class name collisions are inevitable.
**Do this instead:** Always render extension UI inside a Shadow DOM with `mode: 'closed'`. Inline all CSS within the shadow root. This guarantees complete style isolation in both directions.

### Anti-Pattern 5: Assuming Content Script Runs Once

**What people do:** Initialize the content script as if it runs once per page load, set up UI, and never handle re-initialization.
**Why it is wrong:** Azure DevOps is a SPA. The content script loads once, but the user navigates between PR pages, file lists, and other views without triggering a new page load. The injected UI becomes stale or appears on wrong pages.
**Do this instead:** Use `chrome.webNavigation.onHistoryStateUpdated` in the service worker to detect navigation. Have the content script listen for navigation messages and re-evaluate whether to show/hide/update its UI on every navigation event. Implement cleanup for when the user navigates away from a PR page.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Azure DevOps REST API v7.1 | HTTP fetch from service worker. Base URL: `https://dev.azure.com/{org}/{project}/_apis/git/`. Auth via PAT in `Authorization: Basic` header or session cookie. | Rate limits apply. PR thread creation requires `threadContext` with `rightFileStart`/`rightFileEnd` `CommentPosition` objects (line + offset). Use API version `7.1`. |
| OpenAI API | HTTP fetch from service worker. POST to `https://api.openai.com/v1/chat/completions`. Auth via `Authorization: Bearer` header. | Request structured output (JSON mode) for reliable comment parsing. Non-streaming recommended for service worker simplicity; streaming possible but adds keep-alive complexity. |
| Anthropic API | HTTP fetch from service worker. POST to `https://api.anthropic.com/v1/messages`. Auth via `x-api-key` header. | Different request/response format from OpenAI. Requires `anthropic-version` header. Max tokens must be explicitly set. |
| Azure OpenAI | HTTP fetch from service worker. POST to `https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={version}`. Auth via `api-key` header. | URL structure differs from OpenAI. Deployment name replaces model name. API version is a query parameter. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content Script <-> Service Worker | `chrome.runtime.connect()` for long-lived review sessions; `chrome.runtime.sendMessage()` for one-shot queries (settings, auth status) | All messages are typed. Service worker is the authority; content script is a thin UI layer. |
| Service Worker <-> Storage | `chrome.storage.local` for persistent config; `chrome.storage.session` for transient tokens and review state | Always async. Read state at handler start, not at module level. Use `onChanged` listener for reactive updates. |
| Options Page <-> Storage | Direct `chrome.storage.local.get/set` from options page | Options page runs in extension context, has full storage access. Changes propagate via `onChanged` events. |
| Content Script <-> Host Page DOM | DOM manipulation via `document.querySelector`, element creation, Shadow DOM | Content script runs in isolated world. Cannot access page JS variables. Uses DOM as the integration surface. |
| Service Worker -> Content Script (SPA nav) | `chrome.tabs.sendMessage(tabId, ...)` triggered by `chrome.webNavigation.onHistoryStateUpdated` | Service worker initiates; content script responds by updating UI. Requires `webNavigation` permission. |

## Build Order Implications

The components have clear dependency chains that inform the build order:

```
Phase 1: Foundation
  manifest.json + shared/types.ts + shared/messages.ts + storage helpers
  (everything else depends on these)
      |
      v
Phase 2: Service Worker Core + Auth
  service-worker.ts + message routing + auth.ts + storage integration
  (must exist before any API calls or content script communication)
      |
      v
Phase 3: Azure DevOps API Client
  azure-devops.ts + diff-parser.ts
  (must fetch PR data before LLM can review it)
      |
      +------+
      |      |
      v      v
Phase 4a: Content Script + UI Injection     Phase 4b: LLM Integration
  detector.ts + injector.ts + Shadow DOM      provider.ts + openai.ts + prompt-builder.ts
  ReviewButton component                      (can develop in parallel with UI)
  (needs service worker messages working)
      |      |
      +------+
      |
      v
Phase 5: Review Orchestration + Comment Posting
  orchestrator.ts + comment-mapper.ts
  (ties together: fetch diffs -> LLM review -> post comments)
      |
      v
Phase 6: Options Page + Polish
  Options UI (React), prompt editor, model selector
  (settings can use hardcoded defaults until this phase)
```

**Key insight:** The options page is deliberately last. During development, hardcode API keys and settings. Build the core review pipeline first, then add the settings UI. This avoids building UI for configuration that may change as you discover what settings are actually needed.

## Sources

- [Chrome Extension Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) -- Official Chrome docs. HIGH confidence.
- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) -- Official Chrome docs. HIGH confidence.
- [Cross-Origin Network Requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) -- Official Chrome docs. HIGH confidence.
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- Official Chrome docs. HIGH confidence.
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) -- Official Chrome docs. HIGH confidence.
- [Azure DevOps PR Threads Create API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1) -- Official Microsoft docs. HIGH confidence.
- [Offscreen Documents in Manifest V3](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3) -- Official Chrome blog. HIGH confidence.
- [Shadow DOM Style Isolation in Chrome Extensions](https://sweets.chat/blog/article/isolating-styles-in-chrome-extensions-with-shadow-dom) -- Community article. MEDIUM confidence.
- [SPA Navigation Detection](https://medium.com/@softvar/making-chrome-extension-smart-by-supporting-spa-websites-1f76593637e8) -- Community article. MEDIUM confidence.
- [Service Worker Keep-Alive via Port Connection](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- Official docs confirm port connections keep worker alive since Chrome 114+. HIGH confidence.

---
*Architecture research for: PEP Review -- Chrome Extension AI Code Review on Azure DevOps*
*Researched: 2026-02-10*
