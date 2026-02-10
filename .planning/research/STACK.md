# Stack Research

**Domain:** Chrome Extension -- AI-Powered Code Review for Azure DevOps
**Researched:** 2026-02-10
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.9.x | Language | Type safety across all extension contexts (service worker, content script, popup, options). Chrome extension APIs have excellent @types/chrome definitions. Stay on 5.9 -- TypeScript 6/7 are imminent but not stable yet. |
| WXT | 0.20.x | Extension Framework | The standard framework for Manifest V3 extensions in 2025/2026. Built on Vite, file-based entrypoints, auto-generated manifest, HMR for content scripts and service workers, built-in `createShadowRootUi` for injecting UI into Azure DevOps pages. Framework-agnostic. Actively maintained (v0.20.14 is release candidate for v1.0). |
| Vite | 6.x (bundled with WXT) | Build Tool | WXT uses Vite internally. Do not configure separately -- WXT manages it. Fast HMR, Rollup-based production builds, native TypeScript support. |
| React | 18.x or 19.x | UI Framework | For popup, options page, and injected content script UIs. Strong TypeScript support. WXT has first-class React support via `@wxt-dev/module-react`. Use 18.x for stability or 19.x if you need newer features. |

### Azure DevOps Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Native `fetch` API | Built-in | Azure DevOps REST API client | **Do NOT use `azure-devops-node-api` -- it is Node.js-only and will not work in a Chrome extension.** The Azure DevOps REST API v7.1 is well-documented and straightforward to call with `fetch`. Build a thin typed wrapper around the specific endpoints you need (PR details, diffs, threads, comments). Service worker has full `fetch` access; content scripts should delegate to service worker via messaging. |
| Azure DevOps REST API | v7.1 | PR data, diffs, threads, comments | Stable API version. Key endpoints: Pull Requests (get PR metadata), Pull Request Iterations (get diffs), Pull Request Threads (create/list inline comments), Pull Request Thread Comments (add replies). All support PAT auth via Basic header. |

### LLM Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vercel AI SDK (`ai`) | 6.x (6.0.77+) | Unified LLM interface | **Use this instead of individual provider SDKs.** Single API for OpenAI, Anthropic, and Azure OpenAI. Switch providers by changing one line. Supports browser/extension environments. Streaming support built-in. The `generateText` and `streamText` functions work without a backend server. Eliminates maintaining 3 separate SDK integrations. |
| `@ai-sdk/openai` | 3.x | OpenAI + Azure OpenAI provider | AI SDK provider for OpenAI API. Also supports Azure OpenAI endpoints via `createAzure()` factory -- one provider package covers both. |
| `@ai-sdk/anthropic` | 3.x | Anthropic provider | AI SDK provider for Anthropic API (Claude models). |

### Storage and Validation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `chrome.storage.local` | Built-in | Persistent settings storage | Native Chrome extension API. 10MB limit (sufficient for config). Accessible from all extension contexts. Use WXT's built-in storage utilities which wrap this with a cleaner API. |
| Zod | 4.x (4.3.6+) | Schema validation + type inference | Validate LLM provider configs, PAT tokens, user settings. 2kb gzipped core. TypeScript-first -- infer types from schemas so you define once, get both runtime validation and compile-time types. Use for validating AI responses before posting to Azure DevOps. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@wxt-dev/module-react` | latest | WXT React integration | Install alongside WXT when using React for UI components |
| `diff` or `diff2html` | latest | Diff parsing | If you need to parse unified diff output client-side for display or LLM context preparation. Azure DevOps returns iteration changes as structured data, so this may be optional. |
| `webextension-polyfill` | **DO NOT USE** | -- | WXT v0.20 dropped webextension-polyfill. Uses @types/chrome directly. More accurate MV3 types, fewer bugs. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| WXT CLI | Extension dev server, build, zip | `npx wxt dev` for development, `npx wxt build` for production, `npx wxt zip` for distribution |
| Vitest | Unit testing | Comes with Vite ecosystem. Test your Azure DevOps API wrapper and LLM prompt logic without browser. |
| ESLint + Prettier | Linting + formatting | Standard. Use flat config (`eslint.config.js`). |
| `@anthropic-ai/sdk` | **Only for direct Anthropic testing** | If AI SDK abstraction proves insufficient for advanced Anthropic features. Version 0.74.x. Keep as fallback, not primary. |
| `openai` | **Only for direct OpenAI testing** | Same rationale. Version 6.18.x. The AI SDK wraps these internally. |

## Installation

```bash
# Initialize WXT project with React + TypeScript
npx wxt@latest init pep-review --template react

# Core dependencies
npm install ai @ai-sdk/openai @ai-sdk/anthropic zod

# Dev dependencies (most come with WXT)
npm install -D @wxt-dev/module-react vitest
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| WXT | Plasmo | Never for this project. Plasmo uses Parcel (slower, less ecosystem), React-only (limits you), and has maintenance concerns. WXT is the clear winner in 2025/2026. |
| WXT | CRXJS (Vite plugin) | Never. CRXJS is abandoned/unmaintained. |
| WXT | Manual Vite + manifest | Only if WXT conventions conflict with a very unusual requirement. The manual approach means reimplementing what WXT gives you for free (HMR, manifest generation, content script UI injection). |
| Vercel AI SDK | Direct provider SDKs (openai, @anthropic-ai/sdk) | Only if you need provider-specific features the AI SDK does not expose (e.g., Anthropic's extended thinking, very new API features). For standard text generation and streaming, AI SDK is superior because it unifies the interface. |
| Vercel AI SDK | LangChain.js | Never for this project. LangChain adds massive complexity and bundle size for features you do not need (chains, memory, agents). You are doing single-prompt code review, not multi-step agent workflows. |
| Native fetch | azure-devops-node-api | Never. The Node.js client uses Node-specific APIs (http module, file system) that do not work in browser/extension environments. Build a thin typed fetch wrapper instead. |
| Native fetch | azure-devops-extension-api | Never. This is for extensions hosted WITHIN Azure DevOps (marketplace extensions), not Chrome extensions that interact with Azure DevOps externally. Different authentication model entirely. |
| chrome.storage | IndexedDB | Only if you need to store large amounts of data (>10MB) like cached review history. For settings and configuration, chrome.storage is simpler and accessible from all extension contexts without async wrappers. |
| React | Vanilla JS / No framework | Only for the content script if the injected UI is extremely simple (a single button). Once you need any state management or component composition, React pays for itself. WXT's createShadowRootUi works with React out of the box. |
| React | Vue / Svelte | Personal preference. WXT supports all of them. React recommended here because the AI SDK has React-specific hooks (useChat, useCompletion) that could be useful if you add interactive review features. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `azure-devops-node-api` | Node.js-only. Uses `http` module, not `fetch`. Will not bundle for a Chrome extension. | Typed fetch wrapper around Azure DevOps REST API v7.1 |
| `azure-devops-extension-api` / `azure-devops-extension-sdk` | Designed for Azure DevOps marketplace extensions (iframes hosted in Azure DevOps UI), not external Chrome extensions. Wrong authentication and runtime model. | Direct REST API calls with PAT auth |
| `webextension-polyfill` | WXT v0.20 removed it. Uses @types/chrome directly, which has better MV3 coverage and fewer bugs. Adding it back causes type conflicts. | WXT's built-in browser API access |
| Plasmo | Parcel bundler is slower, less flexible than Vite. React-only. Community reports maintenance slowdowns. | WXT |
| CRXJS | Abandoned/unmaintained project. | WXT |
| LangChain.js | Massive dependency tree, complexity overhead for simple prompt-response workflow. Bundle size is unacceptable for a Chrome extension. | Vercel AI SDK |
| Manifest V2 | Chrome has completed MV3 migration enforcement. MV2 extensions are being disabled. | Manifest V3 only |
| Background pages (persistent) | Removed in Manifest V3. Background contexts are now service workers that can be terminated at any time. | Service worker with event-driven architecture |
| Remote code execution | Banned in Manifest V3. Cannot load scripts from external servers. | Bundle all code at build time |

## Stack Patterns by Variant

**If adding Azure OpenAI (enterprise endpoint):**
- Use `@ai-sdk/openai` with `createAzure()` factory
- Same provider package handles both OpenAI and Azure OpenAI
- Configuration differs only in base URL and API version header

**If the user is already authenticated to Azure DevOps in browser:**
- Extract the existing session via `chrome.cookies.get()` for `dev.azure.com`
- This is the "session-first" auth approach -- no PAT needed if user is logged in
- Fall back to PAT from extension storage if cookies unavailable
- Requires `cookies` permission in manifest for `dev.azure.com`

**If targeting Firefox cross-browser in the future:**
- WXT handles this natively -- builds MV2 for Firefox, MV3 for Chrome from same codebase
- No additional framework changes needed
- Test with `npx wxt dev --browser firefox`

**If review responses are large (streaming):**
- AI SDK's `streamText` handles streaming natively
- Display incremental results in the content script UI
- Service worker receives stream, forwards chunks to content script via `chrome.runtime.sendMessage`

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| WXT 0.20.x | Vite 6.x | WXT bundles its own Vite. Do not install Vite separately -- version conflicts. |
| WXT 0.20.x | TypeScript 5.9.x | WXT generates .wxt/ type declarations. Run `wxt prepare` after install. |
| WXT 0.20.x | React 18.x / 19.x | Via `@wxt-dev/module-react`. Both React versions work. |
| AI SDK 6.x | @ai-sdk/openai 3.x | Must use matching major versions. AI SDK 6 requires provider packages at v3+. |
| AI SDK 6.x | @ai-sdk/anthropic 3.x | Same -- matched versioning with AI SDK core. |
| Zod 4.x | AI SDK 6.x | AI SDK uses Zod for structured output (`generateObject`). Ensure same Zod major. |
| TypeScript 5.9.x | Zod 4.x | Full support. Zod 4 requires TS 4.5+ (not an issue). |

## Authentication Architecture

This is a critical stack decision that affects multiple layers:

**Primary: Session-first (cookie-based)**
- When user is logged into Azure DevOps, the extension can make authenticated requests using existing browser session cookies
- Requires `host_permissions: ["https://dev.azure.com/*"]` in manifest
- Requests from the service worker with `credentials: 'include'` will carry the session
- Zero-config for the end user

**Fallback: Personal Access Token (PAT)**
- User enters PAT in extension options page
- Stored in `chrome.storage.local` (encrypted at rest by Chrome)
- Sent as `Authorization: Basic ${btoa(':' + pat)}` header
- Required for users whose org enforces conditional access policies that block cookie sharing

**LLM API keys:**
- Stored in `chrome.storage.local` via options page
- Each provider key stored separately
- Validated with Zod schemas on save
- Sent directly from service worker to LLM APIs (no proxy server needed since keys are user-provided)

## CORS and Permissions

The manifest.json `host_permissions` are critical for this extension:

```json
{
  "host_permissions": [
    "https://dev.azure.com/*",
    "https://*.visualstudio.com/*",
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://*.openai.azure.com/*"
  ],
  "permissions": [
    "storage",
    "cookies",
    "activeTab"
  ]
}
```

Chrome extensions with `host_permissions` bypass CORS for those domains. Service worker `fetch` calls to Azure DevOps and LLM APIs will succeed without CORS headers from those servers. This is a fundamental advantage of the extension architecture -- no proxy server needed.

## Sources

- [WXT Official Site (wxt.dev)](https://wxt.dev/) -- Version 0.20.14 confirmed, feature list, createShadowRootUi API -- HIGH confidence
- [WXT Comparison Page](https://wxt.dev/guide/resources/compare) -- Framework comparison data -- HIGH confidence
- [2025 State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) -- WXT vs Plasmo vs CRXJS analysis -- MEDIUM confidence
- [Chrome Extension Framework Comparison (DevKit.best)](https://www.devkit.best/blog/mdx/chrome-extension-framework-comparison-2025) -- Confirms WXT recommendation -- MEDIUM confidence
- [Azure DevOps REST API - Pull Request Threads (Microsoft Learn)](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads?view=azure-devops-rest-7.1) -- Thread/comment API specification -- HIGH confidence
- [Azure DevOps REST API - Create Thread](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1) -- Inline comment format with threadContext -- HIGH confidence
- [azure-devops-node-api on npm](https://www.npmjs.com/package/azure-devops-node-api) -- Version 15.1.1, confirmed Node.js-only -- HIGH confidence
- [Chrome Cross-Origin Requests Docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) -- host_permissions bypass CORS -- HIGH confidence
- [Vercel AI SDK Introduction](https://ai-sdk.dev/docs/introduction) -- AI SDK 6 overview, unified provider interface -- HIGH confidence
- [AI SDK 6 Announcement](https://vercel.com/blog/ai-sdk-6) -- v6 features, Agent abstraction -- MEDIUM confidence
- [Vercel Labs Chrome Extension Example](https://github.com/vercel-labs/ai-sdk-chrome-extension) -- Confirms AI SDK works in Chrome extensions -- HIGH confidence
- [Building Multi-Provider AI Chrome Extension (Medium)](https://medium.com/@andrewskwesiankomahene/building-delight-a-multi-provider-ai-chrome-extension-with-vercel-ai-sdk-c5c9f700bd55) -- Real-world AI SDK + Chrome extension -- MEDIUM confidence
- [OpenAI Node SDK Browser Support](https://github.com/openai/openai-node/issues/102) -- dangerouslyAllowBrowser flag for browser usage -- MEDIUM confidence
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- Version 0.74.0 -- HIGH confidence
- [openai on npm](https://www.npmjs.com/package/openai) -- Version 6.18.0 -- HIGH confidence
- [Zod Official Site](https://zod.dev/) -- Version 4.x, 2kb core, TypeScript-first -- HIGH confidence
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) -- Current stable version -- HIGH confidence
- [Azure DevOps PAT Authentication (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops) -- Basic auth header format -- HIGH confidence
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) -- Storage limits, async API -- HIGH confidence
- [WXT Content Script UI Guide](https://wxt.dev/guide/key-concepts/content-script-ui.html) -- createShadowRootUi with React -- HIGH confidence

---
*Stack research for: PEP Review -- Chrome Extension AI Code Review for Azure DevOps*
*Researched: 2026-02-10*
