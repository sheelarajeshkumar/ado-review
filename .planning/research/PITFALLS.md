# Pitfalls Research

**Domain:** Chrome Extension for AI Code Review on Azure DevOps
**Researched:** 2026-02-10
**Confidence:** HIGH (verified against official Chrome, Microsoft, and LLM provider documentation)

## Critical Pitfalls

### Pitfall 1: Service Worker Termination Kills Long-Running LLM Requests

**What goes wrong:**
Manifest V3 service workers terminate after 30 seconds of idle time, or forcibly after 5 minutes of continuous execution. A large PR diff sent to an LLM for review can easily take 30-90 seconds for the API to respond. If the service worker orchestrates the LLM call, Chrome kills it mid-flight. The response is lost, the user sees nothing, and there is no error -- just silence. Worse, any state stored in service worker global variables (accumulated review comments, partial results) vanishes on termination.

**Why it happens:**
Developers coming from MV2 (persistent background pages) or from Node.js assume the background context stays alive. The MV3 service worker lifecycle is fundamentally different: 30-second idle timeout, 5-minute hard cap on event processing, and `fetch()` responses that take longer than 30 seconds to arrive also trigger termination. Global variables are wiped on each restart.

**How to avoid:**
- Route all LLM API calls through the service worker but use the `fetch()` keepalive mechanisms. As of Chrome 116+, active WebSocket connections reset the idle timer. More practically, sending or receiving messages across `chrome.runtime` long-lived ports keeps the worker alive (Chrome 114+).
- Implement a heartbeat pattern: if an LLM request is in flight, periodically call a trivial extension API (`chrome.runtime.getPlatformInfo()`) every 25 seconds to reset the idle timer.
- Never store state in global variables. Persist all intermediate state to `chrome.storage.session` (in-memory, survives within the browser session) or `chrome.storage.local` (persists to disk).
- Use `chrome.alarms` instead of `setTimeout`/`setInterval` -- timers are cancelled on service worker termination, alarms survive it.
- For very large PRs, chunk the review into multiple smaller LLM calls. Each call should be independently resumable from persisted state.

**Warning signs:**
- Reviews silently fail to complete on large PRs (50+ files).
- Inconsistent behavior: works when DevTools is open (DevTools keeps service worker alive) but fails when DevTools is closed.
- Users report "it worked once then stopped working."

**Phase to address:**
Phase 1 (Core Architecture). The service worker lifecycle must be designed correctly from the start. Retrofitting keepalive patterns into a service worker that assumes persistence requires rewriting the entire background orchestration layer.

---

### Pitfall 2: Azure DevOps SPA Navigation Destroys Injected UI

**What goes wrong:**
Azure DevOps (dev.azure.com) is a React single-page application. When users navigate between pages (e.g., from PR list to PR detail, or between tabs within a PR), the browser URL changes via `history.pushState` but no full page reload occurs. Content scripts configured with `matches` in manifest.json only execute on full page loads. The extension's injected "Review" button appears on first load, then vanishes when the user navigates within Azure DevOps. The user must manually reload the page to get the button back.

**Why it happens:**
Chrome's content script injection is tied to the `document_idle`/`document_start`/`document_end` lifecycle of a full navigation. SPA route changes do not trigger re-injection. Developers test by navigating directly to a PR URL (full load) and miss the SPA navigation path entirely.

**How to avoid:**
- Use a `MutationObserver` in the content script to watch for DOM changes that indicate a new PR page has been rendered. Observe a stable parent container high in the DOM tree (e.g., `document.body` or a known wrapper) with `{ childList: true, subtree: true }`.
- Intercept the `popstate` event and also monkey-patch `history.pushState` and `history.replaceState` in the MAIN world (not the ISOLATED world) to detect SPA navigations.
- Implement a URL polling fallback: check `location.href` on a short interval (500ms) to detect when the URL matches a PR pattern, then inject/re-inject UI.
- Use `chrome.webNavigation.onHistoryStateUpdated` in the service worker to detect SPA navigations and programmatically re-inject content scripts via `chrome.scripting.executeScript()`.
- Design the content script to be idempotent: calling the injection function multiple times should not duplicate the UI. Check for existing injected elements before inserting.

**Warning signs:**
- Button appears on first visit but disappears after any in-app navigation.
- Users report "I have to refresh the page every time."
- Works perfectly in development when navigating via direct URL but fails in real usage workflows.

**Phase to address:**
Phase 1 (Content Script Architecture). The SPA detection and re-injection mechanism is the foundation of the entire content script layer. Getting this wrong means every UI feature built on top is unreliable.

---

### Pitfall 3: Azure DevOps DOM Selectors Break on Updates

**What goes wrong:**
Azure DevOps uses compiled React with hashed/minified CSS class names (e.g., `bolt-list-row`, `repos-pr-header`, etc.). These class names are not part of any public API contract and can change without notice on any Azure DevOps sprint update (typically every 3 weeks). The extension's content script targets specific CSS selectors to find where to inject the review button or read PR metadata from the DOM. After an Azure DevOps update, selectors stop matching, the extension silently fails to render, and users see nothing.

**Why it happens:**
Developers choose the most obvious selectors visible in the DOM inspector during development. These selectors are internal implementation details of Microsoft's React components, not stable public interfaces. Microsoft makes no guarantees about DOM structure stability for third-party scraping.

**How to avoid:**
- Prefer ARIA attributes, `data-*` attributes, and semantic HTML elements over class names. Azure DevOps uses some `aria-label` attributes and `data-focuszone` patterns that are more stable because they serve accessibility purposes.
- Build a DOM selector abstraction layer: all selectors should be defined in a single `selectors.ts` file. When selectors break, you update one file instead of hunting through the codebase.
- Implement a selector health check: on injection, verify that critical selectors match at least one element. If they don't, log a warning and show a user-facing "Extension needs update" message rather than silently failing.
- Use multiple fallback selectors per target element (primary, secondary, tertiary). Try them in order.
- Minimize DOM dependency: extract PR information (PR ID, repository, project) from the URL pattern (`dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`) and use the REST API for data, rather than scraping it from the DOM. Only use DOM selectors for UI injection points.

**Warning signs:**
- Extension stops rendering UI after an Azure DevOps update, with no errors in the console.
- QA reports "it works on this PR but not that PR" (different page layouts for different PR states).
- CSS selectors in the codebase reference deeply nested class hierarchies.

**Phase to address:**
Phase 1 (Content Script Architecture) for the abstraction layer and health checks. Ongoing maintenance required -- budget for selector updates in every sprint.

---

### Pitfall 4: API Keys Stored Insecurely in Browser Storage

**What goes wrong:**
The extension stores LLM API keys (OpenAI, Anthropic, Azure OpenAI) in `chrome.storage.local` or `chrome.storage.sync` in plaintext. Any other extension with access to `chrome.storage` on the same browser profile, any malware with file system access, or anyone with physical access to the machine can extract these keys. In 2025, a fake AI Chrome extension (H-Chat Assistant) stole 10,000+ OpenAI API keys using exactly this pattern -- validating the key on input, storing it in local storage, and exfiltrating it on user logout.

**Why it happens:**
`chrome.storage.local` is the obvious, easy API for persisting user settings. Developers treat it like a secure keychain, but it is not encrypted at rest, not protected from other extensions in the same profile, and readable from the filesystem at `~/.config/google-chrome/Default/Local Storage/`.

**How to avoid:**
- Use `chrome.storage.session` for API keys during active use. Session storage is in-memory only and never persisted to disk. It is cleared when the browser closes. This significantly reduces the attack surface.
- For persistent storage, encourage users to configure Azure OpenAI endpoints (which use Azure AD/Entra ID authentication) rather than raw API keys. Azure OpenAI auth flows through the same session tokens the user already has.
- If raw API keys must be stored persistently, encrypt them before writing to `chrome.storage.local`. Use the Web Crypto API (`SubtleCrypto`) with a key derived from a user-provided passphrase or from the extension's origin. Note: WebAssembly-based crypto (argon2, libsodium) is not available in MV3 service workers.
- Implement API key rotation reminders. Show users how to set usage limits on their LLM provider accounts.
- Never log API keys. Redact them in any error reporting or analytics.
- Set spend limits on LLM provider accounts as a defense-in-depth measure.

**Warning signs:**
- API keys visible in plaintext when inspecting `chrome.storage.local` via DevTools.
- No encryption wrapper around storage operations.
- Extension requests broader storage permissions than needed.

**Phase to address:**
Phase 2 (Settings and Auth). Must be designed before building the settings UI. Retrofitting encryption onto an existing plaintext storage scheme requires a migration path for existing users.

---

### Pitfall 5: Azure DevOps OAuth Deprecation Leaves Extension Without Auth

**What goes wrong:**
As of April 2025, Microsoft stopped accepting new Azure DevOps OAuth app registrations. The entire Azure DevOps OAuth service is scheduled for full deprecation in 2026. An extension built on Azure DevOps OAuth will stop working entirely when the deprecation completes. The "session-first auth with PAT fallback" strategy described in the project context is the right instinct, but the implementation details matter enormously.

**Why it happens:**
Developers find Azure DevOps OAuth tutorials and samples from 2020-2023, follow them, and build on a deprecated foundation. The deprecation announcement was a DevOps blog post, not a prominent documentation change, so it's easy to miss.

**How to avoid:**
- For the "session-first" auth path: use the existing Azure DevOps session that the user already has in their browser. The content script runs on `dev.azure.com` where the user is already authenticated. Make REST API calls from the content script (same origin), or pass the user's session cookies via `chrome.cookies` API to the service worker. Requests from the same origin inherit the user's existing Entra ID session.
- For the PAT fallback: PATs are also being de-emphasized by Microsoft. Use them as a fallback for edge cases (on-prem Azure DevOps Server where Entra ID is unavailable). Store PATs using the secure storage pattern from Pitfall 4.
- For any new OAuth integration, use Microsoft Entra ID (formerly Azure AD) with MSAL. This is the only forward-compatible path. However, note that for a Chrome extension (not an Azure DevOps marketplace extension), the authentication flow is more complex: you need `chrome.identity.launchWebAuthFlow()` with a registered Entra ID app using the authorization code flow with PKCE.
- Do NOT build on the Azure DevOps OAuth service. It is dead.

**Warning signs:**
- Any code referencing `app.vsaex.visualstudio.com/app/register` (the old OAuth registration endpoint).
- Auth documentation referencing "Azure DevOps OAuth" rather than "Microsoft Entra ID."
- Auth working in development but breaking when Microsoft rolls out deprecation changes.

**Phase to address:**
Phase 1 (Core Architecture) for the session-first approach. Phase 2 (Settings and Auth) for the PAT fallback and optional Entra ID flow. This is not deferrable -- building on deprecated auth means a full rewrite later.

---

### Pitfall 6: LLM Context Window Overflow on Large PRs

**What goes wrong:**
A large PR might contain 50+ changed files with thousands of lines of diff. Naively concatenating all diffs and sending them to an LLM in a single request overflows the context window. Even with models that have large context windows (Claude 200K, GPT-4 128K), the "lost in the middle" effect degrades review quality: LLMs pay attention to the beginning and end of the context but lose fidelity on information in the middle. The review misses critical issues in files that happen to land in the middle of the prompt.

**Why it happens:**
The happy path in development uses small test PRs with 2-3 files. The architecture assumes "just send everything" without encountering real-world PRs. Code diffs are token-expensive due to symbols, indentation, and syntax characters -- a 1,000-line diff might consume 3,000-5,000 tokens.

**How to avoid:**
- Implement a file-by-file review strategy as the default. Review each changed file individually, then generate a summary across all file reviews. This keeps each LLM call focused and within reasonable context bounds.
- For each file, include only relevant context: the diff hunks plus surrounding context lines (10-20 lines before/after), not the entire file.
- Implement token counting before sending requests. Use a lightweight tokenizer (tiktoken for OpenAI models, or a character-based approximation at 4 chars/token) to estimate whether the prompt fits within the model's context window minus the expected output size.
- Set `max_tokens` on every LLM API call to prevent runaway output costs.
- Implement a "large PR" path: if total changes exceed a threshold (e.g., 5,000 lines), prompt the user to confirm before running a potentially expensive review, and consider reviewing only high-priority files (based on file extension, path patterns, or recent change frequency).
- Use smart model routing: route simple/small files to cheaper models (GPT-4o-mini, Haiku) and complex/large files to more capable models.

**Warning signs:**
- LLM API errors with "context length exceeded" messages.
- Reviews that seem to ignore files in large PRs.
- Unexpected API cost spikes from large PRs.
- Review quality is great on small PRs but poor on large ones.

**Phase to address:**
Phase 2 (LLM Integration). The file-by-file chunking strategy and token counting must be part of the initial LLM integration design. Adding it later means reworking the entire prompt construction pipeline.

---

### Pitfall 7: Cross-Origin Requests Fail from Content Scripts

**What goes wrong:**
The content script attempts to call the LLM API directly (e.g., `fetch("https://api.openai.com/v1/chat/completions")`). This fails because content scripts are subject to the page's Content Security Policy and CORS restrictions. Even with `host_permissions` declared in the manifest, content scripts cannot make cross-origin requests to arbitrary domains since Chrome 85+. The developer sees CORS errors in the console and cannot figure out why `host_permissions` isn't working.

**Why it happens:**
The Chrome documentation on `host_permissions` says it grants cross-origin access, but this only applies to the service worker and extension pages, not to content scripts. Content scripts inherit the host page's CSP. This is a subtle distinction that catches nearly every extension developer.

**How to avoid:**
- All LLM API calls MUST go through the service worker. The content script sends a message to the service worker (`chrome.runtime.sendMessage`), the service worker makes the `fetch()` call (where `host_permissions` are effective), and returns the result.
- Declare `host_permissions` for every LLM API domain the extension might contact: `"https://api.openai.com/*"`, `"https://api.anthropic.com/*"`, `"https://*.openai.azure.com/*"`.
- Azure DevOps REST API calls CAN be made from the content script (same origin as the page), but route them through the service worker anyway for consistency and to handle the session/PAT auth logic in one place.
- Establish the message-passing architecture in Phase 1. Every external API call should go through a well-defined service worker handler.

**Warning signs:**
- CORS errors in the console referencing LLM API domains.
- `host_permissions` declared but cross-origin requests still failing.
- API calls work from the service worker but fail from content scripts.

**Phase to address:**
Phase 1 (Core Architecture). The content-script-to-service-worker message bus is foundational. Every feature depends on it.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding DOM selectors throughout content scripts | Fast initial development | Every Azure DevOps update potentially breaks everything; changes require codebase-wide search | Never. Use a centralized selectors file from day one. |
| Storing LLM API keys in `chrome.storage.local` unencrypted | Simple implementation, no crypto complexity | Security vulnerability, reputation risk, potential key theft | Only in MVP with a documented plan to add encryption before public release. |
| Polling `location.href` for SPA navigation detection | Works immediately, no complex observers | CPU waste, delayed detection (up to polling interval), misses edge cases | Acceptable as a fallback alongside MutationObserver and `webNavigation` events. |
| Single monolithic LLM prompt for entire PR | Simpler prompt engineering | Breaks on large PRs, poor review quality, high token costs | Never for production. Acceptable for initial prototype validation only. |
| Using `setTimeout` in service worker | Familiar API | Timer is cancelled on service worker termination; delayed operations silently fail | Never. Use `chrome.alarms` API instead. |
| Skipping token counting before LLM calls | Faster implementation, fewer dependencies | Context window overflow errors, wasted API calls, unpredictable costs | Only in early prototype. Must add before beta. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Azure DevOps REST API | Making API calls without checking rate limit headers, then getting HTTP 429 responses | Read `X-RateLimit-Remaining` from every response. Implement exponential backoff with jitter. Respect `Retry-After` headers. Budget 200 TSTUs per 5-minute window. |
| Azure DevOps REST API | Using the Diffs API to get file contents when you actually need the Items API | Use `GET /git/repositories/{id}/items?path={path}&version={commitId}` to fetch file contents. Use the Diffs API only for the list of changed paths. Use Pull Request Iteration Changes for paginated change lists. |
| Azure DevOps PR Threads API | Creating one thread per comment, flooding the PR with dozens of separate threads | Group related comments. Create one thread per file with the primary finding, add follow-up findings as replies within the same thread. Use `threadContext.filePath` and line positions for inline placement. |
| OpenAI API | Sending requests without `max_tokens`, allowing the model to generate unbounded output | Always set `max_tokens` (or `max_completion_tokens` for newer models). For code review comments, 500-1000 tokens per file review is typically sufficient. |
| Anthropic API | Using the OpenAI SDK format and expecting it to work | Anthropic's API has a different request format (`messages` array structure, `max_tokens` is required, system prompt goes in a separate `system` field, not in the messages array). Either use the Anthropic SDK or build a provider abstraction layer. |
| Azure OpenAI | Using the OpenAI SDK endpoint (`api.openai.com`) instead of the Azure-specific endpoint | Azure OpenAI uses a different base URL (`{resource-name}.openai.azure.com`), requires `api-version` query parameter, and uses either API key or Azure AD auth. The deployment name replaces the model name in the URL path. |
| chrome.cookies API | Assuming the extension can read dev.azure.com cookies without the `cookies` permission and matching `host_permissions` | Declare both `"permissions": ["cookies"]` and `"host_permissions": ["https://dev.azure.com/*"]`. The `cookies` permission alone is insufficient. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| MutationObserver on `document.body` with `subtree: true` without debouncing | Extension causes visible page lag, high CPU usage on Azure DevOps pages | Debounce the observer callback (100-200ms). Disconnect the observer once the target element is found. Narrow the observed subtree to the smallest possible container. | Immediately noticeable on complex Azure DevOps pages with many dynamic elements. |
| Fetching full file contents for every changed file in a large PR | Slow initial review start, high network usage, potential rate limiting | Fetch file contents lazily (only when the file is about to be sent to the LLM). Implement parallel fetching with a concurrency limit (3-5 concurrent requests). Cache file contents for the duration of the review. | PRs with 20+ changed files. |
| Sending LLM requests sequentially, one file at a time | Review takes 2-5 minutes for a 20-file PR (5-15 seconds per file, serially) | Send LLM requests in parallel with a concurrency limit (3-5 concurrent). Aggregate results as they arrive. Show progressive results to the user. | PRs with 10+ files. Reviews feel unacceptably slow. |
| Not implementing response caching for repeated reviews | Each "re-review" of the same PR re-sends all files to the LLM, costing the same tokens again | Cache LLM responses keyed by (file path + diff hash + model + prompt version). Offer "re-review changed files only" for incremental updates. | Users re-running reviews after making small changes to the PR. |
| Unbounded Azure DevOps API pagination | Fetching all changes for a PR with 500+ changed files in a single call overflows the default 100-item limit, silently returning incomplete results | Always check `nextSkip`/`nextTop` in the Iteration Changes API response. Use `$top` and `$skip` parameters. Maximum per request is 2000 changes. | PRs from large refactors or dependency updates touching hundreds of files. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing LLM API keys in `chrome.storage.local` unencrypted | Key theft via malicious extensions, malware, or physical access. Real-world precedent: 10,000+ keys stolen in 2024-2025 via fake Chrome extensions. | Use `chrome.storage.session` for runtime storage (in-memory, not persisted to disk). Encrypt before writing to `chrome.storage.local` if persistence is needed. Use Web Crypto API (`SubtleCrypto`). |
| Requesting `<all_urls>` host permission | Chrome Web Store rejection (44% of rejected submissions in 2024 cited over-privileged requests). Users distrust extensions with broad permissions. | Request only the specific origins needed: `https://dev.azure.com/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://*.openai.azure.com/*`. Use `optional_permissions` for LLM provider domains the user may not need. |
| Logging or transmitting API keys in error reports | Keys leaked through crash reports, analytics, or console logs. | Strip/redact any string matching API key patterns before logging. Never include authorization headers in error payloads. |
| Exposing PAT tokens in content script DOM | Other extensions or page JavaScript could read injected DOM content containing auth tokens. | Never inject auth tokens into the page DOM. Keep all auth handling in the service worker. Content scripts should only receive sanitized data (review comments, not tokens). |
| Using `chrome.cookies` to read Entra ID session cookies and transmitting them | This mirrors the exact pattern of the Cookie-Bite attack (2025). Even for legitimate use, Chrome Web Store reviewers will scrutinize this heavily. | For Azure DevOps API calls from content scripts: rely on same-origin requests that automatically include session cookies. For service worker calls: use the `cookies` permission to read only the specific cookies needed, and never transmit them externally. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during LLM review | Users click "Review" and see nothing for 30-60 seconds. They click again, triggering duplicate reviews. They assume the extension is broken. | Show a progress indicator immediately. Update it as each file is reviewed ("Reviewing file 3 of 15..."). Disable the review button while a review is in progress. |
| Posting dozens of low-quality inline comments | Users are overwhelmed. The noise drowns out real issues. The PR becomes hard to read. | Limit inline comments to high-confidence, actionable findings. Group minor issues into a summary comment. Let users configure comment verbosity (strict/moderate/lenient). |
| No way to dismiss or hide AI comments | AI comments clutter the PR permanently, annoying reviewers who want to focus on human discussion. | Use a consistent prefix (e.g., "[AI Review]") so users can visually filter. Provide a "Resolve all AI comments" action. Consider using PR comment status ("closed") for low-priority findings. |
| Extension UI clashes with Azure DevOps theme | Injected elements look foreign, breaking the visual flow. Light theme extensions on dark theme Azure DevOps. | Match Azure DevOps's design system. Read the current theme from the page's CSS variables or body classes. Use similar fonts, colors, and spacing. |
| Requiring complex setup before first use | Users install the extension, navigate to a PR, and see nothing because they haven't configured API keys yet. | Show a setup prompt on first activation. Provide a "quick start" flow that gets to a working review in under 60 seconds. Support Azure OpenAI with Entra ID auth (no API key needed). |

## "Looks Done But Isn't" Checklist

- [ ] **SPA Navigation:** Content script re-injects UI on SPA route changes, not just full page loads -- verify by navigating between PR list and PR detail without refreshing
- [ ] **Service Worker Restart:** All state survives service worker termination -- verify by triggering a review, closing DevTools, waiting 60 seconds, and checking if it completes
- [ ] **Large PR Handling:** Extension handles PRs with 100+ changed files and 10,000+ lines -- verify with a real large PR, not just test data
- [ ] **Rate Limiting:** Extension backs off correctly when Azure DevOps returns HTTP 429 -- verify by running multiple rapid reviews and checking response handling
- [ ] **Token Overflow:** LLM calls handle files that exceed the context window -- verify by reviewing a file with 5,000+ lines of changes
- [ ] **Error Recovery:** User sees meaningful error messages when LLM API returns errors (rate limit, invalid key, model unavailable) -- verify by intentionally sending an invalid API key
- [ ] **Multiple Tabs:** Extension works correctly when the same PR is open in multiple tabs -- verify by opening the same PR in two tabs and running reviews
- [ ] **Theme Compatibility:** Injected UI works in both Azure DevOps light and dark themes -- verify by switching themes
- [ ] **Permissions Minimality:** Manifest only requests permissions actually used; no `<all_urls>`, no unused optional permissions -- verify by reviewing manifest.json against Chrome Web Store policies
- [ ] **Offline/Network Errors:** Extension handles network failures gracefully for both Azure DevOps API and LLM API calls -- verify by disabling network mid-review

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Service worker state loss | LOW | Implement state persistence to `chrome.storage.session`. Re-read state on service worker activation. No user-facing impact if designed correctly. |
| DOM selectors broken by Azure DevOps update | LOW (if selector abstraction exists) / HIGH (if hardcoded) | Update the centralized `selectors.ts` file. Publish an extension update. If no abstraction layer, requires auditing entire codebase. |
| API key compromised | HIGH | Immediately revoke the key on the LLM provider's dashboard. Notify affected users. Push an extension update with secure storage. Implement key rotation reminders. |
| Azure DevOps OAuth deprecation hits | HIGH | Full auth rewrite to Entra ID with MSAL. Requires new app registration, new auth flow, user re-authentication. Months of work if not planned for. |
| Context window overflow on production PR | LOW | Implement file-by-file chunking. Can be patched quickly since it only affects the prompt construction layer, not the UI or auth. |
| Chrome Web Store rejection | MEDIUM | Review and pare down permissions. Remove any remotely hosted code. Add privacy policy. Fix the specific violation cited. Resubmit. Expect 1-7 day review cycle per resubmission. |
| Cross-origin fetch failure in content script | LOW | Move the fetch call to the service worker with message passing. Straightforward refactor if the message bus already exists. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Service worker termination (Pitfall 1) | Phase 1: Core Architecture | Review completes with DevTools closed on a PR that takes >30s to review |
| SPA navigation breaks UI (Pitfall 2) | Phase 1: Content Script Architecture | Navigate between 5 different Azure DevOps pages without refreshing; button re-appears on every PR page |
| DOM selector fragility (Pitfall 3) | Phase 1: Content Script Architecture | All selectors defined in one file; health check logs warning on zero matches |
| Insecure API key storage (Pitfall 4) | Phase 2: Settings and Auth | API keys not visible in plaintext in chrome.storage.local via DevTools |
| Azure DevOps OAuth deprecation (Pitfall 5) | Phase 1: Core Architecture (session-first), Phase 2: Auth (PAT/Entra fallback) | No references to Azure DevOps OAuth in codebase; session-based auth works without user configuration |
| LLM context window overflow (Pitfall 6) | Phase 2: LLM Integration | Token count logged before each LLM call; large PR (50+ files) completes review without errors |
| Cross-origin fetch failure (Pitfall 7) | Phase 1: Core Architecture | All external API calls routed through service worker; no CORS errors in console |
| API key theft / security incident | Phase 2: Settings and Auth | Penetration test: another extension in the same profile cannot extract stored API keys |
| Chrome Web Store rejection | Phase 3: Polish and Submission | Manifest reviewed against Chrome Web Store program policies checklist; permissions are minimal |
| Rate limiting from Azure DevOps | Phase 2: API Integration | Rate limit headers parsed from every response; 429 errors trigger exponential backoff |
| LLM cost explosion | Phase 2: LLM Integration | Token usage and estimated cost displayed before/after each review; max_tokens set on all calls |

## Sources

- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- Official Chrome documentation on termination conditions, keepalive mechanisms (HIGH confidence)
- [Manifest V3 Known Issues](https://developer.chrome.com/docs/extensions/develop/migrate/known-issues) -- Official Chrome migration issues tracker (HIGH confidence)
- [Cross-origin Network Requests in Extensions](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) -- Official docs on host_permissions and content script CORS (HIGH confidence)
- [Azure DevOps Rate and Usage Limits](https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops) -- 200 TSTU / 5 min limit, throttling headers (HIGH confidence)
- [Azure DevOps Authentication Guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/authentication-guidance?view=azure-devops) -- Entra ID recommended, PATs being phased out (HIGH confidence)
- [No New Azure DevOps OAuth Apps](https://devblogs.microsoft.com/devops/no-new-azure-devops-oauth-apps/) -- Deprecation announcement (HIGH confidence)
- [Azure DevOps PR Iteration Changes API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1) -- Pagination with $top/$skip, 2000 max (HIGH confidence)
- [Azure DevOps PR Threads API](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1) -- Thread/comment creation with file positions (HIGH confidence)
- [Content Scripts on SPAs](https://medium.com/@softvar/making-chrome-extension-smart-by-supporting-spa-websites-1f76593637e8) -- MutationObserver patterns for SPA detection (MEDIUM confidence)
- [Chrome Extension API Key Theft Incident](https://www.obsidiansecurity.com/blog/small-tools-big-risk-when-browser-extensions-start-stealing-api-keys) -- 10,000+ OpenAI keys stolen via fake extension (MEDIUM confidence)
- [Cookie-Bite Attack on Azure Sessions](https://dailysecurityreview.com/cyber-security/cookie-bite-attack-uses-chrome-extension-to-steal-microsoft-session-tokens-and-bypass-mfa/) -- Session cookie theft via Chrome extensions (MEDIUM confidence)
- [Context Window Overflow Management](https://redis.io/blog/context-window-overflow/) -- Lost-in-the-middle effect, overflow strategies (MEDIUM confidence)
- [LLM Token Cost Management](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user) -- Per-user token tracking and cost attribution (MEDIUM confidence)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) -- Submission requirements, permission policies (HIGH confidence)
- [Microsoft Accessibility Insights MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) -- Real-world MV3 migration lessons from Microsoft (MEDIUM confidence)

---
*Pitfalls research for: Chrome Extension AI Code Review on Azure DevOps (PEP Review)*
*Researched: 2026-02-10*
