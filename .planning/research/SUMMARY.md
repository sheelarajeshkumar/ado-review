# Project Research Summary

**Project:** PEP Review — Chrome Extension AI Code Review for Azure DevOps
**Domain:** Chrome Extension (Manifest V3) with AI/LLM Integration
**Researched:** 2026-02-10
**Confidence:** HIGH

## Executive Summary

PEP Review is a Chrome extension that brings AI-powered code review to Azure DevOps pull requests. Research confirms this is a valuable but underserved space: while GitHub has native Copilot integration and GitLab has Duo, Azure DevOps relies on third-party tools that require significant infrastructure setup (webhooks, pipeline tasks, admin approvals). A browser extension that works immediately after installation fills a real gap.

The recommended approach centers on a Manifest V3 extension built with WXT (the modern standard for Chrome extensions), TypeScript, and React for UI components. The extension should use a session-first authentication model (leveraging the user's existing Azure DevOps browser session) with PAT fallback, avoiding the deprecated Azure DevOps OAuth service. LLM integration should use the Vercel AI SDK to unify OpenAI, Anthropic, and Azure OpenAI behind a single interface, with users bringing their own API keys for cost transparency. The architecture splits cleanly: a content script handles DOM injection and UI rendering, while a service worker orchestrates all external API calls (Azure DevOps REST API for PR data, LLM APIs for review generation). File-by-file review is essential to avoid context window overflow and deliver quality results on large PRs.

Key risks include service worker termination during long LLM calls (mitigated via keep-alive port connections), Azure DevOps SPA navigation breaking injected UI (mitigated via `webNavigation` events and MutationObserver patterns), and fragile DOM selectors that break on Azure DevOps updates (mitigated via centralized selector abstraction and URL-based data extraction via REST API). API key security is critical: store keys in `chrome.storage.session` (in-memory) or encrypt before persisting to `chrome.storage.local` to prevent theft. The architecture must be designed from Phase 1 to handle these realities — retrofitting service worker lifecycle management or SPA navigation detection is prohibitively expensive.

## Key Findings

### Recommended Stack

Research converges on WXT as the extension framework (the 2025/2026 standard, built on Vite with Manifest V3 best practices baked in), TypeScript 5.9.x for type safety across all extension contexts, and React 18.x/19.x for UI components. WXT's file-based entry points, auto-generated manifest, and built-in HMR for content scripts make it the clear winner over Plasmo (Parcel-based, slower) and CRXJS (abandoned).

**Core technologies:**
- **WXT 0.20.x**: Extension framework — provides Manifest V3 scaffolding, Vite bundling, content script HMR, Shadow DOM UI injection (`createShadowRootUi`), and framework-agnostic architecture. The industry standard for modern Chrome extensions.
- **TypeScript 5.9.x**: Language — type safety across service worker, content script, popup, and options page. Excellent `@types/chrome` definitions for Chrome extension APIs.
- **React 18.x/19.x**: UI framework — for popup, options page, and injected content script UIs. WXT has first-class React support via `@wxt-dev/module-react`.
- **Vercel AI SDK 6.x**: LLM abstraction layer — unified interface for OpenAI, Anthropic, and Azure OpenAI. Switch providers by changing one line. Works in browser/extension environments. Eliminates maintaining separate SDKs for each provider.
- **Native fetch API + typed wrappers**: Azure DevOps REST API client — `azure-devops-node-api` is Node.js-only and incompatible with Chrome extensions. Build a thin typed wrapper around specific endpoints (Pull Requests, Iterations, Threads, Comments).
- **Zod 4.x**: Schema validation — validate LLM provider configs, API keys, user settings, and LLM responses before posting to Azure DevOps. TypeScript-first (infer types from schemas).

**Critical to avoid:**
- `azure-devops-node-api`: Node.js-only, will not work in Chrome extensions
- `webextension-polyfill`: WXT v0.20 dropped it; uses `@types/chrome` directly
- Plasmo: Slower Parcel bundler, maintenance concerns
- CRXJS: Abandoned/unmaintained
- LangChain.js: Massive complexity overhead for simple prompt-response workflow
- Azure DevOps OAuth: Deprecated as of April 2025, full deprecation in 2026

### Expected Features

Research identifies a clear tier structure based on competitor analysis (CodeRabbit, Qodo Merge, GitHub Copilot, Panto AI) and Azure DevOps ecosystem patterns.

**Must have (table stakes):**
- PR diff fetching via Azure DevOps REST API v7.1
- Inline comments on specific lines (every competitor does this — users expect feedback anchored to code)
- Summary comment per review (high-level overview before line-specific details)
- File-by-file review with smart filtering (exclude lock files, generated code, binaries)
- Multi-LLM provider support (OpenAI, Anthropic, Azure OpenAI) — internal teams have different access
- Configurable API keys/endpoints (no hosted backend, users bring their own keys)
- Review progress indication (30s-2min review duration requires clear feedback)
- Error handling with per-file failure isolation (one file failing must not kill the entire review)
- Extension activation only on Azure DevOps PR URLs (`dev.azure.com/*/pullrequest/*`)

**Should have (competitive advantage):**
- **Review presets** (security, performance, best practices) — the killer differentiator. No competitor offers switchable review modes in a Chrome extension. Users want "security audit mode" vs "performance review mode" with one click.
- **Editable/custom prompts** — power users want to tune what the LLM looks for. Qodo charges for this as a Pro feature; making it free in PEP Review is a strong internal team advantage.
- **Azure DevOps-native experience** (no pipeline required) — most AI code review for Azure DevOps requires CI/CD integration. Zero-infrastructure setup is a massive adoption lever.
- **Cost estimation before review** — show estimated token usage and cost upfront. Internal teams care about API spend. No Chrome extension competitor does this.
- **Severity levels on comments** (Critical/Warning/Info) — helps developers prioritize which feedback to address first.
- **One-click re-review after changes** — re-run the same review on updated diff without reconfiguring.

**Defer (v2+):**
- Combinable review presets (run security + performance in one pass)
- Review history/log (chrome.storage quota management adds complexity)
- Team-shared presets (JSON export/import) — defer until multiple teams adopt
- Side panel UI (popup is sufficient for v1, side panel is better UX but higher complexity)

**Anti-features (deliberately not building):**
- Auto-fix/auto-commit suggestions (Chrome extension cannot perform git operations; defeats code review purpose)
- Full codebase context/repository indexing (requires server-side component, contradicts zero-infrastructure value prop)
- Hosted backend/proxy service (infrastructure to maintain, security concerns, hosting costs)
- Real-time streaming comments to PR (creates notification spam, Azure DevOps API rate limits)
- Automatic review on PR creation (requires webhooks/server, user should control when to review)
- Chat/conversational interface in PR (significant UI complexity, high maintenance burden)
- Multi-platform support (GitHub/GitLab/Bitbucket) — focus on best-in-class Azure DevOps experience

### Architecture Approach

Manifest V3 extensions split into isolated contexts: service workers (background processing, no DOM), content scripts (DOM manipulation, subject to page CSP), and extension pages (popup, options). The architecture must respect these boundaries and the service worker lifecycle (30s idle timeout, 5min hard cap, global state wiped on termination).

**Major components:**
1. **Service Worker** — Central orchestrator. Receives review requests from content script, fetches PR data from Azure DevOps REST API, sends code to LLM APIs, returns structured review results. Manages auth tokens. All external API calls happen here (avoids CORS issues). Event-driven, state persisted to `chrome.storage`, never global variables.
2. **Content Script** — Detects PR pages on dev.azure.com, injects review button and results UI into Azure DevOps DOM via Shadow DOM (style isolation), relays user actions to service worker. Thin layer — delegates all logic to service worker. Handles SPA navigation detection via `MutationObserver` and `webNavigation` events.
3. **Options Page** — Full settings UI for API keys, LLM provider selection, model configuration, custom prompts, and auth setup (PAT entry). React + TypeScript, reads/writes `chrome.storage.local`.
4. **Popup (optional)** — Lightweight status indicator and quick actions (review this PR, last review status). React + TypeScript, communicates with service worker via messages.

**Key patterns:**
- **Message-based command pattern**: All communication between content script and service worker uses typed messages with a `type` discriminator. Service worker has message handler registry.
- **Shadow DOM isolation**: All injected UI renders inside a closed Shadow DOM with scoped styles to prevent CSS conflicts with Azure DevOps.
- **SPA navigation detection**: Use `chrome.webNavigation.onHistoryStateUpdated` + `MutationObserver` to detect Azure DevOps SPA route changes (content scripts only fire on full page load).
- **Service worker keep-alive**: Use long-lived port connection from content script during review processing to keep service worker alive through 30s+ LLM calls.

**Data flow (review execution):**
Content script injects button → User clicks → Opens port to service worker → Service worker fetches PR data (Azure DevOps API) → Parses diffs into chunks → Builds prompts → Sends to LLM (file-by-file, progress updates via port) → Maps LLM output to Azure DevOps comment positions → Posts comments back to PR (Azure DevOps API) → Returns results → Content script updates UI, closes port.

### Critical Pitfalls

Research identifies seven critical pitfalls that must be addressed in architecture, not patched later.

1. **Service worker termination kills long-running LLM requests** — Service workers terminate after 30s idle or 5min total. LLM calls can take 30-90s. Termination wipes global state and loses responses. **Solution:** Use long-lived port connections to keep worker alive, persist all state to `chrome.storage.session`, implement heartbeat pattern. **Must address in Phase 1 (Core Architecture).**

2. **Azure DevOps SPA navigation destroys injected UI** — Azure DevOps is a React SPA. Content scripts only fire on full page loads. UI vanishes on route changes. **Solution:** Use `webNavigation.onHistoryStateUpdated` + `MutationObserver` to detect navigation, re-inject UI idempotently. **Must address in Phase 1 (Content Script Architecture).**

3. **Azure DevOps DOM selectors break on updates** — Class names are hashed/minified React internals, not stable APIs. They change every 3 weeks on Azure DevOps sprint updates. **Solution:** Centralize all selectors in one file, prefer ARIA attributes and semantic HTML, use URL-based extraction via REST API instead of DOM scraping, implement selector health checks. **Must address in Phase 1 (Content Script Architecture).**

4. **API keys stored insecurely in browser storage** — `chrome.storage.local` is plaintext, readable by other extensions and malware. Real-world precedent: 10,000+ OpenAI API keys stolen in 2024-2025 via fake Chrome extensions. **Solution:** Use `chrome.storage.session` (in-memory, not persisted) or encrypt before writing to `chrome.storage.local` via Web Crypto API. **Must address in Phase 2 (Settings and Auth).**

5. **Azure DevOps OAuth deprecation** — Microsoft stopped accepting new OAuth app registrations in April 2025, full deprecation in 2026. Building on Azure DevOps OAuth = dead end. **Solution:** Session-first auth (leverage user's existing browser session on dev.azure.com) with PAT fallback. For future: Entra ID with MSAL via `chrome.identity.launchWebAuthFlow()`. **Must address in Phase 1 (session-first) and Phase 2 (PAT/Entra fallback).**

6. **LLM context window overflow on large PRs** — Large PRs (50+ files, 10,000+ lines) overflow context windows. "Lost in the middle" effect degrades review quality even with 128K+ token models. **Solution:** File-by-file review with token counting before each call, set `max_tokens` on all LLM calls, use smart model routing (cheaper models for simple files). **Must address in Phase 2 (LLM Integration).**

7. **Cross-origin requests fail from content scripts** — Content scripts are subject to page CSP and CORS. `host_permissions` only apply to service worker and extension pages, not content scripts. **Solution:** All LLM and Azure DevOps API calls MUST go through service worker via message passing. **Must address in Phase 1 (Core Architecture).**

## Implications for Roadmap

Based on research, the project naturally decomposes into three core phases followed by polish. Dependencies flow clearly: foundation (messaging, service worker lifecycle) → API integrations (Azure DevOps, LLM) → feature richness (presets, custom prompts, settings UI).

### Phase 1: Foundation & Content Script Architecture
**Rationale:** Service worker lifecycle, SPA navigation detection, and content script-to-service worker messaging are foundational. Every feature depends on these working correctly. Getting these wrong means rewriting the entire codebase later. Research shows this is the most common failure point for Chrome extensions (service worker termination, SPA navigation, CORS).

**Delivers:**
- WXT project initialized with TypeScript + React
- Service worker with message routing and state persistence patterns
- Content script with SPA navigation detection (webNavigation + MutationObserver)
- Shadow DOM UI injection at correct location in Azure DevOps DOM
- Extension activates only on PR URLs (`dev.azure.com/*/pullrequest/*`)
- Centralized DOM selector abstraction layer
- Session-first auth for Azure DevOps (leverage existing browser session)

**Addresses:**
- Table stakes: Extension activation on PR URLs
- Critical Pitfall 1: Service worker termination (keep-alive pattern)
- Critical Pitfall 2: SPA navigation (detection + re-injection)
- Critical Pitfall 3: DOM selector fragility (abstraction + health checks)
- Critical Pitfall 5: Azure DevOps OAuth deprecation (session-first approach)
- Critical Pitfall 7: Cross-origin fetch failure (service worker message bus)

**Avoids:** Building features on an unstable foundation. This phase is not glamorous but absolutely critical.

**Research flag:** LOW — Chrome extension architecture is well-documented (official Chrome docs, WXT docs, multiple real-world examples). No additional research needed.

---

### Phase 2: Azure DevOps & LLM Integration
**Rationale:** With foundation in place, Phase 2 integrates the two external systems: Azure DevOps REST API (data source) and LLM APIs (review engine). These must work before any review features are possible. File-by-file review strategy is essential here to handle context window limits (Pitfall 6).

**Delivers:**
- Azure DevOps REST API client (typed fetch wrapper around Threads, Iterations, Pull Requests endpoints)
- PR diff fetching with pagination handling
- Diff parser (converts Azure DevOps API response to reviewable chunks)
- LLM provider abstraction (Vercel AI SDK with OpenAI, Anthropic, Azure OpenAI)
- File-by-file review orchestrator with token counting
- Prompt builder (constructs LLM prompts from diff + file context)
- Comment mapper (maps LLM output to Azure DevOps comment positions with `threadContext`)
- Inline comment posting to Azure DevOps PR
- Summary comment generation
- Basic file filtering (exclude lock files, binaries, generated code by default)
- Review progress indication (badge, UI updates per file)
- Error handling with per-file failure isolation

**Addresses:**
- Table stakes: PR diff fetching, inline comments, summary comment, file-by-file review, multi-LLM provider support, review progress, error handling, file filtering
- Critical Pitfall 6: LLM context window overflow (file-by-file + token counting)

**Uses:**
- WXT service worker patterns (Phase 1)
- Native fetch + Zod for Azure DevOps client
- Vercel AI SDK for LLM abstraction
- Chrome storage for provider config

**Implements:**
- Service worker review orchestration pipeline: fetch diffs → parse → prompt → LLM call → map → post comments
- Azure DevOps API integration points (rate limit handling, pagination)
- LLM API integration points (structured output, max_tokens, error handling)

**Research flag:** LOW-MEDIUM
- Azure DevOps REST API: LOW (official Microsoft docs are excellent, HIGH confidence)
- LLM integration: LOW (Vercel AI SDK docs + provider docs are comprehensive)
- File chunking strategy: MEDIUM (requires experimentation to find optimal chunk sizes per model)

---

### Phase 3: Review Presets & Settings UI
**Rationale:** With core review working end-to-end, Phase 3 adds the differentiating feature (review presets) and the settings UI. Presets require experimentation with prompt engineering — deferring this until the pipeline works means faster iteration on prompts without fighting infrastructure issues.

**Delivers:**
- Options page UI (React) for API key configuration, LLM provider/model selection
- Review preset system (security, performance, best practices) with prompt templates
- Preset selector UI in injected content script (dropdown or tabs)
- Custom/editable prompts in options page (template editor with variables)
- PAT fallback auth configuration (for users without browser session access)
- Cost estimation before review (token counting + model pricing)
- Severity levels on inline comments (Critical/Warning/Info) with color-coded badges
- One-click re-review (store last review config, button to replay on current diff)
- Configurable file filter patterns (glob-based include/exclude in options)

**Addresses:**
- Should have: Review presets (PRIMARY DIFFERENTIATOR), custom prompts, cost estimation, severity levels, one-click re-review, configurable file filtering
- Table stakes: Configurable API keys/endpoints
- Critical Pitfall 4: API key storage security (encrypt or use session storage)

**Uses:**
- Chrome storage API for settings persistence
- Zod schemas for API key validation
- Prompt template system (variables: file name, diff, language, PR context)

**Research flag:** MEDIUM
- Prompt engineering for presets: MEDIUM (research shows categories are well-established — security/OWASP, performance, logic, accessibility — but tuning prompts for quality requires experimentation)
- Chrome storage encryption: LOW (Web Crypto API is well-documented)

---

### Phase 4: Polish & Submission
**Rationale:** Final phase for UX refinement, Chrome Web Store preparation, and edge case handling discovered during internal testing.

**Delivers:**
- Theme compatibility (Azure DevOps light/dark theme detection + styling)
- Improved error messages (user-facing, actionable guidance)
- Offline/network error handling
- Multiple-tab handling (same PR open in multiple tabs)
- Large PR warnings (prompt user before reviewing 100+ file PRs)
- Chrome Web Store submission preparation (privacy policy, screenshots, description)
- Permissions audit (ensure minimal permissions, justify each)
- Documentation (README, user guide)

**Addresses:**
- UX pitfalls identified in research (no progress indication → users think it's broken; no theme compatibility → looks foreign)
- Chrome Web Store rejection risks (over-privileged permissions, missing privacy policy)

**Research flag:** LOW — Chrome Web Store submission policies are well-documented. UX refinements based on user testing feedback.

---

### Phase Ordering Rationale

**Dependency-driven:**
- Phase 2 (API integration) cannot start until Phase 1 (service worker messaging, content script injection) works. LLM calls require service worker orchestration; PR data requires API client framework.
- Phase 3 (presets, settings) benefits from having Phase 2 complete. Iterating on prompts is faster when the review pipeline is stable. Settings UI needs real API integration to validate configurations.
- Phase 4 (polish) happens after feature-complete. Cannot submit to Chrome Web Store without core functionality working.

**Risk mitigation:**
- Phase 1 addresses the highest-risk pitfalls (service worker termination, SPA navigation, CORS, auth deprecation). These are architectural — fixing them later means rewriting. Front-load the risk.
- Phase 2 delivers end-to-end value (a working review, even with a generic prompt). Internal teams can start using it for validation. Proves the concept before investing in preset differentiation.
- Phase 3 adds the differentiators that make PEP Review compelling vs competitors. By this point, the foundation is solid and prompt iteration is fast.

**Feature coherence:**
- Each phase delivers a coherent set of capabilities. Phase 1 = "extension is alive and injected." Phase 2 = "extension can review PRs." Phase 3 = "extension has advanced features." Phase 4 = "extension is polished and ready for broader rollout."
- Avoids the trap of building features in isolation that don't integrate well (e.g., building settings UI before knowing what settings are actually needed).

**Parallelization opportunities:**
- Within Phase 2, Azure DevOps API client and LLM provider integration can be developed in parallel (different developers or sprints) as long as Phase 1 message bus exists.
- Within Phase 3, options page UI and preset prompt engineering can proceed in parallel (UI consumes a settings schema; prompts populate that schema).

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Review Presets):** Prompt engineering for quality security/performance/best-practices reviews requires experimentation. Initial research identifies categories and examples, but tuning for optimal results on real Azure DevOps PRs will need iteration. Consider `/gsd:research-phase` to gather prompt patterns from Awesome Reviewers, CodeRabbit examples, and Graphite's guide.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Chrome extension architecture is extremely well-documented. WXT docs, Chrome official docs, and real-world examples (Microsoft Accessibility Insights MV3 migration, Vercel Labs AI SDK Chrome extension) provide comprehensive coverage. HIGH confidence, no additional research needed.
- **Phase 2 (API Integration):** Azure DevOps REST API and LLM provider APIs are officially documented with HIGH confidence. File chunking strategy is straightforward (well-established pattern). No deep research needed — implementation and testing are sufficient.
- **Phase 4 (Polish):** Chrome Web Store policies and UX best practices are well-documented. This is execution-focused, not research-intensive.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | WXT, TypeScript, React, Vercel AI SDK are all actively maintained with excellent documentation. Verified against official sources (wxt.dev, Chrome developer docs, Vercel AI SDK docs, Azure DevOps REST API docs). No bleeding-edge dependencies. |
| Features | **MEDIUM-HIGH** | Table stakes identified from competitor analysis (CodeRabbit, Qodo Merge, GitHub Copilot) with high confidence. Differentiators (review presets, custom prompts) validated against community patterns but require prompt engineering experimentation. Anti-features identified from real-world pitfalls (auto-fix requires git access extensions lack, chat adds fragile UI complexity). |
| Architecture | **HIGH** | Manifest V3 patterns are well-established. Service worker lifecycle, content script injection, Shadow DOM isolation, and message passing are officially documented by Chrome. Azure DevOps SPA navigation and DOM selector fragility confirmed via community articles and real-world extension examples. |
| Pitfalls | **HIGH** | All critical pitfalls verified against official documentation (Chrome service worker lifecycle, Azure DevOps OAuth deprecation announcement, Chrome Web Store policies) or real-world incidents (API key theft via fake extensions, Cookie-Bite attack). Recovery strategies based on Chrome extension best practices and Microsoft's own MV3 migration lessons. |

**Overall confidence:** **HIGH**

Research is grounded in official documentation (Chrome, Microsoft, LLM providers), active framework releases (WXT 0.20.14 RC for v1.0), and real-world precedent (competitor products, security incidents, migration case studies). The recommended stack is current (not bleeding-edge), widely adopted, and well-supported. The architecture patterns are proven (not experimental).

### Gaps to Address

**Prompt engineering quality:** Research identifies review categories (security, performance, best practices) and provides examples from Awesome Reviewers and Graphite, but optimal prompt formulations for Azure DevOps PRs require experimentation. **Handle during Phase 3 planning:** Allocate time for prompt iteration and testing on real PRs. Consider A/B testing prompts with the internal team.

**Azure DevOps DOM selector stability:** Research identifies the risk and mitigation strategies (ARIA attributes, centralized selectors, health checks, URL-based extraction), but cannot predict which specific selectors will break or when. **Handle during Phase 1 and ongoing:** Build the abstraction layer from the start. Budget for selector maintenance in every sprint after launch. Monitor Azure DevOps release notes.

**LLM context window optimal chunking:** Research recommends file-by-file review and token counting, but the ideal chunk size (e.g., should very large files be sub-chunked?) and context inclusion (how many surrounding lines?) require tuning per model. **Handle during Phase 2 implementation:** Start with conservative defaults (entire file per review, 10 lines surrounding context), then optimize based on review quality and cost metrics.

**Chrome Web Store review process unpredictability:** Research identifies common rejection reasons (over-privileged permissions, missing privacy policy), but the review process has subjective elements. **Handle during Phase 4 submission:** Prepare for 1-2 resubmission cycles. Follow Chrome Web Store program policies checklist meticulously. Justify every permission in the manifest and in the privacy policy.

**Azure DevOps rate limits in practice:** Documentation states 200 TSTU per 5-minute window, but real-world thresholds and throttling behavior may vary by org or tier. **Handle during Phase 2 testing:** Implement rate limit header parsing and exponential backoff from the start. Test with realistic review volumes (e.g., 10 PRs back-to-back) to observe throttling.

## Sources

### Primary (HIGH confidence)
- [WXT Official Site (wxt.dev)](https://wxt.dev/) — Version 0.20.14, framework features, API reference
- [Chrome Extension Developer Docs](https://developer.chrome.com/docs/extensions/) — Service worker lifecycle, content scripts, messaging, storage API, webNavigation
- [Azure DevOps REST API Documentation](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/?view=azure-devops-rest-7.1) — Pull Request Threads, Iterations, Comments, rate limits
- [Vercel AI SDK Documentation](https://ai-sdk.dev/docs/introduction) — Provider abstraction, API reference
- [Microsoft: No New Azure DevOps OAuth Apps](https://devblogs.microsoft.com/devops/no-new-azure-devops-oauth-apps/) — OAuth deprecation announcement
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) — Submission requirements, permission policies
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) — Current stable version
- [Zod Official Site](https://zod.dev/) — Schema validation, type inference

### Secondary (MEDIUM confidence)
- [Qodo Blog: Best AI Code Review Tools 2026](https://www.qodo.ai/blog/best-ai-code-review-tools-2026/) — Competitor feature comparison
- [Qodo Merge Chrome Extension Docs](https://qodo-merge-docs.qodo.ai/chrome-extension/features/) — Feature reference
- [CodeRabbit Documentation](https://docs.coderabbit.ai/) — Competitor patterns
- [2025 State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — WXT vs Plasmo vs CRXJS comparison
- [Awesome Reviewers](https://github.com/baz-scm/awesome-reviewers) — System prompts for code review categories
- [Graphite: Effective Prompt Engineering for AI Code Reviews](https://graphite.com/guides/effective-prompt-engineering-ai-code-reviews) — Prompt patterns
- [Vercel Labs Chrome Extension Example](https://github.com/vercel-labs/ai-sdk-chrome-extension) — AI SDK in Chrome extension context
- [Content Scripts on SPAs](https://medium.com/@softvar/making-chrome-extension-smart-by-supporting-spa-websites-1f76593637e8) — SPA navigation detection patterns
- [Microsoft Accessibility Insights MV3 Migration](https://devblogs.microsoft.com/engineering-at-microsoft/learnings-from-migrating-accessibility-insights-for-web-to-chromes-manifest-v3/) — Real-world MV3 lessons
- [Chrome Extension API Key Theft Incident](https://www.obsidiansecurity.com/blog/small-tools-big-risk-when-browser-extensions-start-stealing-api-keys) — 10,000+ keys stolen
- [Cookie-Bite Attack](https://dailysecurityreview.com/cyber-security/cookie-bite-attack-uses-chrome-extension-to-steal-microsoft-session-tokens-and-bypass-mfa/) — Session token theft via extensions

### Tertiary (LOW confidence — context/background only)
- [Panto AI Blog: Azure DevOps Code Review Tools](https://www.getpanto.ai/blog/best-azure-devops-code-review-tools-to-fast-track-your-team-in-2025) — Vendor comparison for market context
- [Building Multi-Provider AI Chrome Extension (Medium)](https://medium.com/@andrewskwesiankomahene/building-delight-a-multi-provider-ai-chrome-extension-with-vercel-ai-sdk-c5c9f700bd55) — Community example

---
*Research completed: 2026-02-10*
*Ready for roadmap: yes*
