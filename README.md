# PEP Review

AI-powered code review Chrome extension for Azure DevOps pull requests. Automatically reviews changed files using OpenAI GPT-4o, posts inline comments with findings, and generates a summary — all directly from the PR page.

## Features

- **One-click review** — A "PEP Review" button injected into every Azure DevOps PR page
- **AI-powered analysis** — Uses OpenAI GPT-4o with structured output to identify bugs, security vulnerabilities, performance issues, and code smells
- **Inline PR comments** — Posts findings as inline comments on the exact lines with severity levels (Critical / Warning / Info)
- **PR summary** — Generates and posts a markdown summary comment with file-by-file breakdown
- **Floating results panel** — Popover panel showing real-time progress, severity badges, and collapsible file-by-file results
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
│   └── ReviewPanel.tsx — Floating popover with results
├── Options Page (options/)
│   └── Organization URL, PAT, and OpenAI API key configuration
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
    │   └── threads.ts — Inline comments and summary posting
    ├── auth/ — Authentication cascade
    │   ├── manager.ts — Session-first, PAT-fallback orchestration
    │   ├── session.ts — Browser cookie-based auth testing
    │   └── pat.ts — PAT storage, validation, and auth headers
    ├── review/ — Review pipeline
    │   ├── orchestrator.ts — End-to-end review coordinator
    │   ├── llm-reviewer.ts — Single-file OpenAI review via Vercel AI SDK
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
4. **Review each file** — Send file content to GPT-4o with line numbers, receive validated structured findings
5. **Post inline comments** — Create PR thread comments at exact line positions with severity and suggestions
6. **Post summary** — Generate and post a PR-level markdown summary with severity breakdown
7. **Show results** — Display findings in the floating panel with export options

Each file is reviewed independently with error isolation — if one file fails after retries, the pipeline continues with the remaining files.

## Prerequisites

- **Chrome** (or Chromium-based browser)
- **Azure DevOps** account with access to the target repositories
- **OpenAI API key** with access to GPT-4o

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
3. Enter your **OpenAI API key** (`sk-...`)
4. (Optional) If session auth doesn't work, enter an **Azure DevOps PAT** with Code (Read) scope

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
- **[Vercel AI SDK](https://sdk.vercel.ai/)** — OpenAI integration with structured output validation
- **Zod** — Runtime schema validation for LLM responses
- **Chrome Manifest V3** — Service worker-based background script

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist PAT, API key, and organization URL |
| `https://dev.azure.com/*` | Access Azure DevOps PR pages and REST API |
| `https://*.visualstudio.com/*` | Legacy Azure DevOps domain support |
| `https://api.openai.com/*` | Send code to OpenAI for review |

## Finding Severity Levels

| Severity | Description | Examples |
|---|---|---|
| **Critical** | Bugs, security vulnerabilities, data loss risks | SQL injection, null reference, race condition |
| **Warning** | Code smells, potential issues, error handling gaps | Missing error handling, performance concerns |
| **Info** | Style suggestions, minor improvements | Naming conventions, simplification opportunities |
