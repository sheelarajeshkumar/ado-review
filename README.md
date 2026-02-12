# PEP Review

AI-powered code review Chrome extension for Azure DevOps pull requests. Reviews changed files using configurable AI providers (OpenAI, Anthropic, Google Gemini, Ollama), posts inline comments with findings, and generates a summary — all directly from the PR page.

## Features

- **One-click review** — A "PEP Review" button injected into every Azure DevOps PR page
- **Multi-provider AI** — Choose from OpenAI, Anthropic Claude, Google Gemini, or local Ollama models
- **Multi-model routing** — Optional fast model for small files (≤150 lines), deep model for complex ones
- **Changed-lines-only review** — Reviews only the changed lines in each file, using the full file as context
- **Explainable findings** — Every finding includes a "Why" explanation referencing best practices, security principles, or performance implications
- **Suggested code fixes** — Findings include replacement code blocks with one-click "Copy Fix" buttons
- **Inline diff annotations** — Colored severity dots injected into the Azure DevOps diff view next to lines with findings; click to see a Shadow DOM popover with details
- **Secret redaction** — Automatically scans and redacts API keys, tokens, passwords, and credentials before sending code to the LLM
- **Inline PR comments** — Posts findings as inline comments on the exact lines with severity levels (Critical / Warning / Info)
- **PR summary** — Generates and posts a markdown summary comment with file-by-file breakdown
- **Floating results panel** — Popover panel showing real-time progress, donut chart, severity bars, and collapsible file-by-file results
- **Dark mode** — Theme toggle in the panel and options page
- **Draft comments** — Findings are shown in the panel first; post to PR only when ready
- **Stop & discard** — Stop a review mid-flight (keeps partial results) or discard entirely
- **Export & copy** — Download findings as a markdown file or copy to clipboard
- **Smart file filtering** — Automatically skips non-code files (images, lock files, binaries, build artifacts)
- **Error isolation** — One file failure doesn't stop the pipeline; all other files continue to be reviewed
- **Retry with backoff** — Transient API failures are retried automatically
- **Session + PAT auth** — Uses browser session cookies first, falls back to Personal Access Token
- **Shadow DOM isolation** — UI styles don't leak into Azure DevOps and vice versa
- **SPA navigation aware** — Handles Azure DevOps single-page navigation between PRs

## Architecture

```
Chrome Extension (Manifest V3)
├── Service Worker (background.ts)
│   ├── Message handler registry (CHECK_AUTH, SAVE_PAT)
│   └── Port-based review sessions (long-lived connections)
├── Content Script (ado-pr.content/)
│   ├── App.tsx — State machine + port hook
│   ├── ReviewButton.tsx — Presentational trigger button
│   ├── ReviewPanel.tsx — Floating popover with results
│   └── inline-annotations.ts — Diff view severity dots + Shadow DOM popovers
├── Options Page (options/)
│   └── Organization URL, PAT, AI provider, and fast model configuration
├── Popup (popup/)
│   └── Quick status view
├── Shared
│   ├── types.ts — Shared TypeScript interfaces
│   ├── messages.ts — Typed message definitions
│   ├── storage.ts — chrome.storage.local helpers
│   └── constants.ts — Skip lists for file filtering
└── Lib
    ├── ado-api/ — Azure DevOps REST API client
    │   ├── client.ts — Authenticated fetch wrapper
    │   ├── pull-requests.ts — PR details, iterations, changed files
    │   ├── file-content.ts — File content retrieval
    │   ├── diff.ts — Diff computation for changed line ranges
    │   └── threads.ts — Inline comments and summary posting
    ├── auth/ — Authentication cascade
    │   ├── manager.ts — Session-first, PAT-fallback orchestration
    │   ├── session.ts — Browser cookie-based auth testing
    │   └── pat.ts — PAT storage, validation, and auth headers
    ├── review/ — Review pipeline
    │   ├── orchestrator.ts — End-to-end review coordinator
    │   ├── llm-reviewer.ts — Single-file AI review (Vercel AI SDK + official Ollama client)
    │   ├── secret-filter.ts — PII and secret redaction before LLM calls
    │   ├── schemas.ts — Zod schemas for structured LLM output
    │   ├── prompt-builder.ts — System and user prompt construction
    │   ├── comment-mapper.ts — Finding-to-comment posting + summary generation
    │   ├── file-filter.ts — Non-code file detection
    │   └── retry.ts — Exponential backoff retry utility
    ├── url-matcher.ts — PR URL parsing
    └── selectors.ts — Azure DevOps DOM selectors
```

## Review Pipeline

When a user clicks "PEP Review" on a PR page:

1. **Authenticate** — Verify Azure DevOps access (session cookies or PAT)
2. **Fetch PR data** — Get PR details, latest iteration, and changed files
3. **Filter** — Skip non-code files (images, lock files, binaries, etc.)
4. **Redact secrets** — Scan file content and replace any detected credentials with `[REDACTED:<type>]` placeholders
5. **Compute diff** — Fetch diff between target and source commits to identify changed line ranges
6. **Route model** — Select fast model for small files (≤150 lines) or deep model for larger files
7. **Review each file** — Send changed lines (with full file as context) to the AI, receive validated structured findings with severity, suggested code fix, and "why" explanation
8. **Show results** — Display findings in the floating panel with inline diff annotations
9. **Post to PR** — User reviews findings, then clicks "Post to PR" to create inline comments and a summary

Each file is reviewed independently with error isolation — if one file fails after retries, the pipeline continues with the remaining files.

## Prerequisites

- **Chrome** (or Chromium-based browser)
- **Azure DevOps** account with access to the target repositories
- **AI provider API key** — OpenAI, Anthropic, or Google Gemini (or a local Ollama instance)
- **Ollama setup** (if using local models) — [Install Ollama](https://ollama.com/) and allow Chrome extension origins:

  ```
  launchctl setenv OLLAMA_ORIGINS "*"
  ```

  Then restart the Ollama app. This is required because Ollama blocks non-localhost origins by default.

## Setup

### Install dependencies

```
pnpm install
```

### Build the extension

```
pnpm build
```

The built extension will be in `.output/chrome-mv3/`.

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3/` directory

### Configure

1. Click the PEP Review extension icon or go to the options page
2. Enter your **Azure DevOps organization** name or URL (e.g., `PepsiCoIT` or `https://dev.azure.com/PepsiCoIT`)
3. Select your **AI provider** and enter the **model name** and **API key**
4. (Optional) Configure a **fast model** for small files under the collapsible "Fast Model" section
5. (Optional) If session auth doesn't work, enter an **Azure DevOps PAT** with Code (Read) scope

## Development

### Dev mode with hot reload

```
pnpm dev
```

### Type checking

```
pnpm check
```

### Run tests

```
pnpm test
```

### Watch mode for tests

```
pnpm test:watch
```

## Tech Stack

- **[WXT](https://wxt.dev/)** — Web Extension framework with Vite, HMR, and cross-browser support
- **React 19** — UI components with Shadow DOM isolation
- **TypeScript** — Strict typing throughout
- **[Vercel AI SDK](https://sdk.vercel.ai/)** — Multi-provider AI integration with structured output validation (OpenAI, Anthropic, Google)
- **[Ollama JS](https://github.com/ollama/ollama-js)** — Official Ollama client for local model support
- **Zod** — Runtime schema validation for LLM responses
- **Tailwind CSS** — Utility-first styling with dark mode support
- **Chrome Manifest V3** — Service worker-based background script

## Supported AI Providers

| Provider | Model Examples | API Key Required | Notes |
|---|---|---|---|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | Yes | Optional base URL for Azure OpenAI |
| **Anthropic** | `claude-sonnet-4-20250514` | Yes | |
| **Google Gemini** | `gemini-2.0-flash` | Yes | |
| **Ollama** | `codellama:7b` | No | Local models via official [ollama-js](https://github.com/ollama/ollama-js) client |

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist PAT, API key, and organization URL |
| `https://dev.azure.com/*` | Access Azure DevOps PR pages and REST API |
| `https://*.visualstudio.com/*` | Legacy Azure DevOps domain support |
| `https://api.openai.com/*` | Send code to OpenAI for review |
| `https://api.anthropic.com/*` | Send code to Anthropic for review |
| `https://generativelanguage.googleapis.com/*` | Send code to Google Gemini for review |
| `http://localhost/*` | Connect to local Ollama instance |

## Finding Severity Levels

| Severity | Description | Examples |
|---|---|---|
| **Critical** | Bugs, security vulnerabilities, data loss risks | SQL injection, null reference, race condition |
| **Warning** | Code smells, potential issues, error handling gaps | Missing error handling, performance concerns |
| **Info** | Style suggestions, minor improvements | Naming conventions, simplification opportunities |

Each finding includes a **Why** explanation — a brief rationale referencing best practices, security principles, or performance implications to help developers learn from the review.
