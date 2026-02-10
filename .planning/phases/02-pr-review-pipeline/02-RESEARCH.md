# Phase 2: PR Review Pipeline - Research

**Researched:** 2026-02-10
**Domain:** Azure DevOps REST API + Vercel AI SDK + Chrome Extension Service Worker orchestration
**Confidence:** HIGH

## Summary

Phase 2 transforms the extension shell (Phase 1) into a working AI code review pipeline. The core flow is: user clicks review button -> service worker fetches PR changes from Azure DevOps REST API -> filters non-code files -> sends each file to an LLM via Vercel AI SDK -> parses structured review output -> posts inline comments and summary back to the PR via Azure DevOps Threads API.

The existing Phase 1 codebase provides solid foundations: typed message passing (`sendMessage`), auth management (`getAuthHeaders` with session-first + PAT fallback), URL parsing (`parsePrUrl`, `buildApiUrl`), Shadow DOM UI injection, and SPA navigation handling. Phase 2 builds directly on these. The main new concerns are: (1) Azure DevOps REST API client for fetching PR iterations/changes and file content, (2) LLM integration via Vercel AI SDK's `generateText` with `Output.object()` for structured review output, (3) a long-lived port connection to keep the service worker alive during multi-file reviews, (4) posting comments back via the PR Threads API, and (5) progress reporting to the content script UI.

**Primary recommendation:** Build the pipeline as a sequence of composable, independently-testable modules in `lib/`: an ADO API client, a file filter, an LLM reviewer (AI SDK + Zod schema), a comment mapper, and a review orchestrator. Use a long-lived port (`browser.runtime.connect`) between content script and service worker for keepalive and progress streaming. Use `generateText` with `Output.object()` and a Zod schema to get structured review findings from the LLM, ensuring every LLM response is validated before posting to Azure DevOps.

## Standard Stack

### Core (new for Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.x | Unified LLM interface | Single API for OpenAI (Phase 2), Anthropic and Azure OpenAI (Phase 3). `generateText` with `Output.object()` gives structured output validated by Zod. Works in browser/service worker. Already decided in STACK.md. |
| `@ai-sdk/openai` | 3.x | OpenAI provider for AI SDK | Paired with AI SDK 6.x. Provides `createOpenAI()` factory. Supports both OpenAI and Azure OpenAI. |
| `zod` | 4.x (4.3.6) | LLM output validation | Already installed. AI SDK uses Zod schemas for structured output. Define review finding schema once, get both runtime validation and TypeScript types. |

### Existing (from Phase 1 -- no changes needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `wxt` | 0.20.x | Extension framework | Installed. Provides `defineBackground`, `createShadowRootUi`, `browser.*` global. |
| `react` | 19.x | UI framework | Installed. Content script UI for progress, button states. |
| `typescript` | 5.9.x | Language | Installed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel AI SDK `generateText` + `Output.object()` | Direct `fetch` to OpenAI API | Lose provider abstraction, structured output validation, and easy Phase 3 multi-provider support. Not worth it. |
| Vercel AI SDK `generateText` | `generateObject` (legacy) | `generateObject` is deprecated in AI SDK 6. Use `generateText` with `Output.object()` instead. |
| Hand-rolled retry | `p-retry` or `exponential-backoff` npm packages | Adds dependency for ~30 lines of code. Hand-roll for this project -- the retry logic is simple (wrap a single async function with delay). |

**Installation:**
```bash
npm install ai @ai-sdk/openai
```

Note: `zod` is already installed (4.3.6). No other new dependencies needed.

## Architecture Patterns

### Recommended Project Structure (new files for Phase 2)

```
lib/
+-- ado-api/
|   +-- client.ts          # Authenticated fetch wrapper for ADO REST API
|   +-- pull-requests.ts   # PR metadata, iterations, iteration changes
|   +-- file-content.ts    # Fetch file content at specific commits
|   +-- threads.ts         # Create PR comment threads (inline + summary)
|   +-- types.ts           # ADO API response types
+-- review/
|   +-- orchestrator.ts    # Top-level review coordination (file-by-file loop)
|   +-- file-filter.ts     # Skip non-code files (lockfiles, binaries, images)
|   +-- llm-reviewer.ts    # Send file diff to LLM, parse structured output
|   +-- prompt-builder.ts  # Build system + user prompts for code review
|   +-- comment-mapper.ts  # Map LLM findings to ADO thread positions
|   +-- schemas.ts         # Zod schemas for LLM output (findings, summary)
|   +-- retry.ts           # Exponential backoff retry utility
|   +-- types.ts           # Review pipeline types (ReviewResult, Finding, etc.)
+-- auth/                  # (exists) session.ts, pat.ts, manager.ts
+-- url-matcher.ts         # (exists) parsePrUrl, buildApiUrl
+-- selectors.ts           # (exists) DOM selectors

shared/
+-- types.ts               # (extend) Add ReviewProgress, ReviewResult types
+-- messages.ts            # (extend) Add START_REVIEW, REVIEW_PROGRESS, etc.
+-- storage.ts             # (extend) Add LLM API key storage helpers
+-- constants.ts           # (extend) Add ADO API paths, file filter patterns

entrypoints/
+-- background.ts          # (extend) Add port connection handler, review message handlers
+-- ado-pr.content/
    +-- App.tsx             # (extend) Add review states (progress, complete, error)
    +-- components/
        +-- ReviewButton.tsx    # (rewrite) Trigger review via port, show progress
        +-- ReviewProgress.tsx  # (new) File-by-file progress indicator
```

### Pattern 1: Long-Lived Port for Review Session

**What:** Use `browser.runtime.connect()` to open a long-lived port between content script and service worker for the duration of a review. The port serves two purposes: (1) keeps the service worker alive during long LLM calls, and (2) provides a bidirectional channel for streaming progress updates.

**When to use:** Every time the user clicks the review button.

**Why:** Chrome terminates service workers after 30s idle. A multi-file review with LLM calls can take 60-300 seconds. Since Chrome 114+, sending/receiving messages over a port resets the idle timer. The port is the only reliable keep-alive mechanism that also provides progress streaming.

**Example:**
```typescript
// Content script: open port when review starts
const port = browser.runtime.connect({ name: 'review' });

port.postMessage({
  type: 'START_REVIEW',
  payload: { prInfo },
});

port.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'REVIEW_PROGRESS':
      updateProgressUI(msg.payload); // { currentFile, fileIndex, totalFiles }
      break;
    case 'REVIEW_FILE_COMPLETE':
      addFileResult(msg.payload); // { filePath, findings, error? }
      break;
    case 'REVIEW_COMPLETE':
      showSummary(msg.payload); // { summary, totalFindings, errors }
      port.disconnect();
      break;
    case 'REVIEW_ERROR':
      showError(msg.payload); // { message }
      port.disconnect();
      break;
  }
});

// Service worker: handle port connections
browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'review') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'START_REVIEW') {
      await runReview(msg.payload.prInfo, (progress) => {
        port.postMessage(progress);
      });
    }
  });
});
```

### Pattern 2: File-by-File Review with Isolated Error Handling

**What:** Review each changed file independently. If one file's LLM call fails (after retries), log the error and continue to the next file. Accumulate results as a map of file path to review outcome (success with findings, or failure with error).

**When to use:** The core review loop.

**Why:** CORE-05 requires per-file error isolation. A 429 rate limit on one file should not abort the remaining 15 files. Users see partial results with clear indication of which files failed.

**Example:**
```typescript
// lib/review/orchestrator.ts
interface FileReviewResult {
  filePath: string;
  status: 'success' | 'error' | 'skipped';
  findings?: Finding[];
  error?: string;
}

async function reviewFiles(
  files: ChangedFile[],
  onProgress: (progress: ReviewProgress) => void,
): Promise<FileReviewResult[]> {
  const results: FileReviewResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress({
      type: 'REVIEW_PROGRESS',
      payload: {
        currentFile: file.path,
        fileIndex: i + 1,
        totalFiles: files.length,
      },
    });

    try {
      const findings = await retryWithBackoff(
        () => reviewSingleFile(file),
        { maxRetries: 3, baseDelayMs: 1000 },
      );
      results.push({ filePath: file.path, status: 'success', findings });
    } catch (error) {
      results.push({
        filePath: file.path,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    onProgress({
      type: 'REVIEW_FILE_COMPLETE',
      payload: results[results.length - 1],
    });
  }

  return results;
}
```

### Pattern 3: Structured LLM Output with Zod Validation

**What:** Use AI SDK's `generateText` with `Output.object()` and a Zod schema to get structured review findings. The schema defines exactly what fields each finding must have (line number, severity, message, suggestion). AI SDK validates the LLM output against the schema before returning.

**When to use:** Every LLM review call.

**Why:** Raw LLM text output is unreliable for automated comment posting. Structured output ensures every finding has the required fields (line, severity, message) for mapping to Azure DevOps thread positions. Validation catches malformed output before it reaches the posting step.

**Example:**
```typescript
// lib/review/schemas.ts
import { z } from 'zod';

export const FindingSchema = z.object({
  line: z.number().describe('The line number in the changed file where the issue is'),
  severity: z.enum(['Critical', 'Warning', 'Info']).describe('Severity level'),
  message: z.string().describe('Clear description of the issue found'),
  suggestion: z.string().optional().describe('Suggested fix or improvement'),
});

export const FileReviewSchema = z.object({
  findings: z.array(FindingSchema).describe('List of issues found in this file'),
  summary: z.string().describe('One-sentence summary of this file review'),
});

export type Finding = z.infer<typeof FindingSchema>;
export type FileReview = z.infer<typeof FileReviewSchema>;

// lib/review/llm-reviewer.ts
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { FileReviewSchema } from './schemas';

export async function reviewFile(
  fileContent: string,
  filePath: string,
  apiKey: string,
): Promise<FileReview> {
  const openai = createOpenAI({ apiKey });

  const { output } = await generateText({
    model: openai('gpt-4o'),
    output: Output.object({
      schema: FileReviewSchema,
    }),
    system: buildSystemPrompt(),
    prompt: buildFileReviewPrompt(filePath, fileContent),
    maxTokens: 2000,
  });

  if (!output) {
    throw new Error(`LLM returned no structured output for ${filePath}`);
  }

  return output;
}
```

### Pattern 4: ADO API Client with Auth Integration

**What:** A thin typed wrapper around Azure DevOps REST API v7.1 that uses the existing auth module (`getAuthHeaders`) for authentication. All API calls go through a single `adoFetch` function that adds auth headers, API version parameter, and error handling.

**When to use:** Every Azure DevOps API call.

**Why:** Centralizes auth header injection, API version management, and error handling. The existing `getAuthHeaders()` already handles session-first + PAT fallback. This wrapper just composes it with fetch.

**Example:**
```typescript
// lib/ado-api/client.ts
import { getAuthHeaders } from '@/lib/auth/manager';
import { ADO_API_VERSION } from '@/shared/constants';

export async function adoFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const auth = await getAuthHeaders(extractOrgUrl(url));
  if (!auth) {
    throw new Error('Not authenticated with Azure DevOps');
  }

  const headers = new Headers(options?.headers);
  headers.set('Accept', 'application/json');

  // Merge auth headers
  for (const [key, value] of Object.entries(auth.headers)) {
    headers.set(key, value);
  }

  // Add API version if not already in URL
  const urlObj = new URL(url);
  if (!urlObj.searchParams.has('api-version')) {
    urlObj.searchParams.set('api-version', ADO_API_VERSION);
  }

  const response = await fetch(urlObj.toString(), {
    ...options,
    credentials: auth.method === 'session' ? 'include' : undefined,
    headers,
  });

  if (!response.ok) {
    throw new AdoApiError(response.status, await response.text(), url);
  }

  return response;
}
```

### Anti-Patterns to Avoid

- **Sending all files in one LLM call:** Overflows context window, degrades review quality, makes per-file error isolation impossible. Always review file-by-file.
- **Using `browser.runtime.sendMessage` for the review flow:** One-shot messages cannot keep the service worker alive. The response channel closes after the first reply. Use `browser.runtime.connect` (port) instead.
- **Storing review state in service worker global variables:** Service worker can terminate at any time. All intermediate state (which files reviewed, results so far) must be persisted to `browser.storage.session` or communicated via port messages.
- **Making ADO API calls from the content script:** Content scripts are subject to the page's CSP. Route all API calls through the service worker via port messages.
- **Posting comments without `threadContext`:** Inline comments require `threadContext` with `filePath`, `rightFileStart`, and `rightFileEnd`. Without this, comments appear as generic PR-level comments, not anchored to specific lines.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API integration | Custom fetch wrappers per provider | Vercel AI SDK `generateText` with `@ai-sdk/openai` | Provider abstraction, structured output validation, automatic error types. Phase 3 adds Anthropic/Azure with zero refactoring. |
| Structured LLM output parsing | Regex/string parsing of LLM text | AI SDK `Output.object()` with Zod schema | LLMs output malformed JSON ~5-10% of the time. AI SDK handles retries, validation, and error surfacing automatically. |
| Azure DevOps auth | New auth module | Existing `getAuthHeaders()` from `lib/auth/manager.ts` | Already built in Phase 1. Handles session-first + PAT fallback. Just compose with the new ADO API client. |
| SPA navigation / UI injection | New content script setup | Existing `ado-pr.content/index.tsx` with `wxt:locationchange` | Already built in Phase 1. Extend the existing `App.tsx` with new review states. |

**Key insight:** Phase 1 built the extension shell and auth layer. Phase 2 should build ON TOP of these, not beside them. The message system, auth module, URL parser, and content script lifecycle are all reusable.

## Common Pitfalls

### Pitfall 1: Service Worker Termination During Review

**What goes wrong:** Multi-file LLM review takes 60-300 seconds. Service worker terminates after 30s idle, killing in-flight requests. Review silently fails.
**Why it happens:** Developers test with DevTools open (keeps worker alive) and miss the termination in production.
**How to avoid:** Use `browser.runtime.connect()` (long-lived port) from content script BEFORE starting review. Send progress messages over the port to reset the idle timer. Each port message resets the 30s timer (Chrome 114+).
**Warning signs:** Review works with DevTools open but fails without. Review fails on PRs with many files but works on small ones.

### Pitfall 2: Azure DevOps Thread Position Off-by-One

**What goes wrong:** Inline comments appear on the wrong line in the PR. The LLM reports line 42, but the comment shows up on line 41 or 43.
**Why it happens:** Azure DevOps `CommentPosition` uses 1-based line numbers and 1-based offsets. The LLM may report 0-based lines depending on how the diff context is formatted. Also, the line number must refer to the RIGHT side (new file) of the diff, not the left side (old file).
**How to avoid:** Always use `rightFileStart` and `rightFileEnd` for new code comments. Ensure line numbers from the LLM are mapped to the iteration's file line numbers, not raw diff hunk positions. Use `offset: 1` for `rightFileStart` (start of line) and a large offset for `rightFileEnd` (end of line) to highlight the full line.
**Warning signs:** Comments on wrong lines, or comments not appearing at all (line number out of range for the file).

### Pitfall 3: LLM Returns Line Numbers Outside Changed Range

**What goes wrong:** LLM suggests a finding on line 150, but the file diff only covers lines 10-50. Azure DevOps rejects the thread creation because the line position is outside the changed range.
**Why it happens:** If you send the full file content (not just the diff), the LLM may comment on unchanged code. Or the LLM hallucinates line numbers.
**How to avoid:** Only send the changed portions of the file to the LLM. Include clear line number annotations in the prompt (e.g., "Lines 10-50 are the changed code"). Validate LLM findings against the known changed line range before posting. Silently drop or convert to summary any findings with out-of-range line numbers.
**Warning signs:** 4xx errors from Azure DevOps thread creation API. Comments appearing in the summary that should have been inline.

### Pitfall 4: Non-Code Files Waste Tokens

**What goes wrong:** The extension sends `package-lock.json` (50,000+ lines) to the LLM. The review costs $2+ in tokens and returns useless findings like "lock file has many dependencies."
**Why it happens:** No file filter in the review pipeline. Every changed file gets reviewed.
**How to avoid:** Implement a file filter before the LLM step. Filter by extension (`.lock`, `.min.js`, `.map`, `.png`, `.jpg`, `.gif`, `.svg`, `.ico`, `.woff`, `.ttf`, `.eot`), by path pattern (`node_modules/`, `vendor/`, `.generated/`), and by content metadata (`isBinary: true` from ADO Items API response). Make the filter list comprehensive but configurable in future phases.
**Warning signs:** Reviews taking very long on PRs with dependency updates. High token costs.

### Pitfall 5: Forgetting `credentials: 'include'` on Session Auth

**What goes wrong:** ADO API calls from the service worker return 401 even though the user is logged into Azure DevOps.
**Why it happens:** Service worker fetch does NOT automatically include cookies, even with `host_permissions`. The `credentials: 'include'` option must be explicitly set. Phase 1's `sessionFetch` already does this, but new ADO API code might bypass it.
**How to avoid:** The `adoFetch` wrapper must check `auth.method` and set `credentials: 'include'` when using session auth. Route ALL ADO calls through this wrapper.
**Warning signs:** Session auth works in the options page auth check but fails in review API calls.

### Pitfall 6: Rate Limits on Comment Posting

**What goes wrong:** After reviewing 20 files with 50+ findings, the extension tries to create 50 separate threads rapidly. Azure DevOps rate-limits the requests (HTTP 429), and some comments fail to post.
**Why it happens:** Sequential rapid POST requests to the threads API exceed the 200 TSTU / 5-minute rate limit.
**How to avoid:** Post threads sequentially with a small delay between each (100-200ms). Read `X-RateLimit-Remaining` and `Retry-After` headers. If rate-limited, pause and retry after the `Retry-After` period. Limit total inline comments per review (e.g., max 25-30 findings per file, max 100 per PR) to avoid noise flooding.
**Warning signs:** Some comments fail to post on large reviews. 429 errors in service worker console.

## Code Examples

### Fetching PR Changed Files

```typescript
// lib/ado-api/pull-requests.ts
// Source: Azure DevOps REST API v7.1 - Pull Request Iterations + Iteration Changes

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';

/** Get the latest iteration ID for a PR */
export async function getLatestIterationId(prInfo: PrInfo): Promise<number> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/iterations`;
  const response = await adoFetch(url);
  const data = await response.json();
  const iterations = data.value as Array<{ id: number }>;
  return Math.max(...iterations.map((i) => i.id));
}

/** Get all changed files for a PR iteration */
export async function getChangedFiles(
  prInfo: PrInfo,
  iterationId: number,
): Promise<IterationChange[]> {
  const allChanges: IterationChange[] = [];
  let skip = 0;
  const top = 100;

  while (true) {
    const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/iterations/${iterationId}/changes?$top=${top}&$skip=${skip}`;
    const response = await adoFetch(url);
    const data = await response.json();

    allChanges.push(...data.changeEntries);

    if (data.nextSkip === 0 || data.changeEntries.length < top) break;
    skip = data.nextSkip;
  }

  return allChanges;
}

interface IterationChange {
  changeTrackingId: number;
  changeId: number;
  item: { objectId: string; path: string };
  changeType: string; // 'add' | 'edit' | 'delete' | 'rename'
}
```

### Fetching File Content at a Specific Commit

```typescript
// lib/ado-api/file-content.ts
// Source: Azure DevOps REST API v7.1 - Items - Get

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';

/** Fetch file content from a specific commit */
export async function getFileContent(
  prInfo: PrInfo,
  filePath: string,
  commitId: string,
): Promise<string> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/items` +
    `?path=${encodeURIComponent(filePath)}` +
    `&includeContent=true` +
    `&versionDescriptor.version=${commitId}` +
    `&versionDescriptor.versionType=commit` +
    `&$format=json`;

  const response = await adoFetch(url);
  const data = await response.json();
  return data.content ?? '';
}

/** Fetch file metadata to check if binary */
export async function getFileMetadata(
  prInfo: PrInfo,
  filePath: string,
  commitId: string,
): Promise<{ isBinary: boolean; isImage: boolean; extension: string }> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/items` +
    `?path=${encodeURIComponent(filePath)}` +
    `&includeContentMetadata=true` +
    `&versionDescriptor.version=${commitId}` +
    `&versionDescriptor.versionType=commit`;

  const response = await adoFetch(url);
  const data = await response.json();
  return {
    isBinary: data.contentMetadata?.isBinary ?? false,
    isImage: data.contentMetadata?.isImage ?? false,
    extension: data.contentMetadata?.extension ?? '',
  };
}
```

### Getting PR Source and Target Commits

```typescript
// lib/ado-api/pull-requests.ts
// Source: Azure DevOps REST API v7.1 - Pull Requests - Get

export interface PrDetails {
  sourceCommitId: string;
  targetCommitId: string;
  title: string;
  description: string;
  repositoryId: string;
}

export async function getPrDetails(prInfo: PrInfo): Promise<PrDetails> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}`;
  const response = await adoFetch(url);
  const data = await response.json();

  return {
    sourceCommitId: data.lastMergeSourceCommit.commitId,
    targetCommitId: data.lastMergeTargetCommit.commitId,
    title: data.title,
    description: data.description ?? '',
    repositoryId: data.repository.id,
  };
}
```

### Posting Inline Comments

```typescript
// lib/ado-api/threads.ts
// Source: Azure DevOps REST API v7.1 - Pull Request Threads - Create

import { adoFetch } from './client';
import type { PrInfo } from '@/shared/types';
import type { Finding } from '@/lib/review/schemas';

/** Post an inline comment thread on a specific file line */
export async function postInlineComment(
  prInfo: PrInfo,
  filePath: string,
  finding: Finding,
  iterationId: number,
): Promise<void> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/threads`;

  const severityTag = `**[${finding.severity}]**`;
  const content = finding.suggestion
    ? `${severityTag} ${finding.message}\n\n**Suggestion:** ${finding.suggestion}`
    : `${severityTag} ${finding.message}`;

  await adoFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content,
          commentType: 1, // text
        },
      ],
      status: 1, // active
      threadContext: {
        filePath: filePath.startsWith('/') ? filePath : `/${filePath}`,
        rightFileStart: { line: finding.line, offset: 1 },
        rightFileEnd: { line: finding.line, offset: 1000 }, // highlight full line
      },
    }),
  });
}

/** Post a summary comment (no file context -- PR-level) */
export async function postSummaryComment(
  prInfo: PrInfo,
  summaryMarkdown: string,
): Promise<void> {
  const url = `${prInfo.baseUrl}/_apis/git/repositories/${prInfo.repo}/pullRequests/${prInfo.prId}/threads`;

  await adoFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comments: [
        {
          parentCommentId: 0,
          content: summaryMarkdown,
          commentType: 1,
        },
      ],
      status: 1,
    }),
  });
}
```

### File Filter for Non-Code Files

```typescript
// lib/review/file-filter.ts

/** Extensions to always skip -- non-code files */
const SKIP_EXTENSIONS = new Set([
  // Lock files
  '.lock',
  // Minified/bundled
  '.min.js', '.min.css', '.bundle.js',
  // Source maps
  '.map',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.bmp', '.webp',
  // Fonts
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // Binary/compiled
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  // Archives
  '.zip', '.tar', '.gz', '.rar',
]);

/** File names to always skip */
const SKIP_FILENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  '.DS_Store',
  'Thumbs.db',
]);

/** Path patterns to always skip */
const SKIP_PATH_PATTERNS = [
  /node_modules\//,
  /vendor\//,
  /\.generated\//,
  /dist\//,
  /build\//,
  /\.next\//,
];

export function shouldSkipFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() ?? '';
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()! : '';

  // Check exact filename
  if (SKIP_FILENAMES.has(fileName)) return true;

  // Check extension
  if (SKIP_EXTENSIONS.has(ext.toLowerCase())) return true;

  // Check path patterns
  if (SKIP_PATH_PATTERNS.some((p) => p.test(filePath))) return true;

  return false;
}

export function shouldSkipByChangeType(changeType: string): boolean {
  // Don't review deleted files -- there's no code to review
  return changeType === 'delete';
}
```

### Exponential Backoff Retry

```typescript
// lib/review/retry.ts

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
}

/**
 * Retry an async function with exponential backoff and jitter.
 * CORE-06 requirement.
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

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // TypeScript: unreachable but needed for type safety
  throw new Error('Retry exhausted');
}
```

### LLM Review Prompt

```typescript
// lib/review/prompt-builder.ts

export function buildSystemPrompt(): string {
  return `You are a senior software engineer performing a code review. Your task is to review the changed code and identify issues.

For each issue you find, provide:
- The exact line number where the issue is located
- A severity level: "Critical" (bugs, security issues), "Warning" (code smells, potential issues), or "Info" (style, suggestions)
- A clear, concise description of the issue
- An optional suggestion for how to fix it

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Error handling gaps
- Code maintainability

Do NOT comment on:
- Formatting or whitespace (handled by linters)
- Missing documentation unless critical for understanding
- Subjective style preferences

Be concise. Only report genuine issues, not noise.`;
}

export function buildFileReviewPrompt(
  filePath: string,
  fileContent: string,
  changeType: string,
): string {
  return `Review the following ${changeType === 'add' ? 'new' : 'changed'} file.

**File:** \`${filePath}\`

\`\`\`
${fileContent}
\`\`\`

Analyze the code above and report any issues found. If no issues are found, return an empty findings array with a brief positive summary.`;
}
```

### Message Types Extension

```typescript
// Additions to shared/messages.ts

// Add to the Message discriminated union:
| { type: 'START_REVIEW'; payload: { prInfo: PrInfo } }
| { type: 'REVIEW_PROGRESS'; payload: ReviewProgress }
| { type: 'REVIEW_FILE_COMPLETE'; payload: FileReviewResult }
| { type: 'REVIEW_COMPLETE'; payload: ReviewSummary }
| { type: 'REVIEW_ERROR'; payload: { message: string } }

// Note: START_REVIEW goes over the PORT, not sendMessage.
// The other types are sent as port.postMessage from the service worker.
// They do NOT use the sendMessage helper (that's for one-shot messages).
```

## Azure DevOps REST API Reference

### API Endpoints Used in Phase 2

| Endpoint | Method | Purpose | Key Parameters |
|----------|--------|---------|----------------|
| `/git/repositories/{repo}/pullRequests/{prId}` | GET | PR metadata (source/target commits) | `includeCommits` |
| `/git/repositories/{repo}/pullRequests/{prId}/iterations` | GET | List iterations (to get latest ID) | `includeCommits` |
| `/git/repositories/{repo}/pullRequests/{prId}/iterations/{iterationId}/changes` | GET | Changed files list | `$top`, `$skip` |
| `/git/repositories/{repo}/items` | GET | File content at commit | `path`, `versionDescriptor.version`, `versionDescriptor.versionType=commit`, `includeContent=true` |
| `/git/repositories/{repo}/pullRequests/{prId}/threads` | POST | Post inline/summary comments | Request body with `threadContext`, `comments` |

### Thread Context Structure (Critical)

For inline comments anchored to specific lines:
```json
{
  "threadContext": {
    "filePath": "/path/to/file.ts",
    "rightFileStart": { "line": 42, "offset": 1 },
    "rightFileEnd": { "line": 42, "offset": 1000 }
  }
}
```

- `filePath`: Must start with `/`. Use the path from iteration changes.
- `rightFileStart.line`: 1-based line number on the NEW side of the diff.
- `rightFileStart.offset`: 1-based character offset. Use `1` for start-of-line.
- `rightFileEnd`: Use same line with large offset to highlight the full line.
- For summary comments (PR-level): omit `threadContext` entirely.
- `status: 1` means "active" thread.
- `commentType: 1` means "text" comment.

### Authentication Pattern for API Calls

Session auth:
```typescript
fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } })
```

PAT auth:
```typescript
fetch(url, { headers: { 'Authorization': `Basic ${btoa(':' + pat)}`, 'Accept': 'application/json' } })
```

The existing `getAuthHeaders()` from `lib/auth/manager.ts` returns the correct headers and method. The new `adoFetch` wrapper just composes this.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` | `generateText()` with `Output.object()` | AI SDK 6.0 (2025) | `generateObject` is deprecated. Use the new pattern for all structured output. |
| One-shot `sendMessage` for long ops | Port connection (`runtime.connect`) | Chrome 114+ (2023) | Ports reset idle timer. Required for operations > 30s. |
| `chrome.*` APIs | `browser.*` (WXT global) | WXT convention | WXT provides a `browser` global. Never use `chrome.*` directly. |
| `webextension-polyfill` | WXT built-in browser types | WXT 0.20 | Polyfill removed. `browser.*` maps to chrome APIs directly. |

**Deprecated/outdated:**
- `generateObject` from AI SDK: Use `generateText` with `Output.object()` instead (AI SDK 6.x)
- Azure DevOps OAuth: Deprecated 2025, being removed 2026. Use session auth + PAT only.

## Review Pipeline Data Flow

```
User clicks "PEP Review" button
    |
    v
[Content Script] Opens port: browser.runtime.connect({ name: 'review' })
    |
    | port.postMessage({ type: 'START_REVIEW', payload: { prInfo } })
    v
[Service Worker] orchestrator.ts begins:
    |
    +--1--> getPrDetails(prInfo)
    |       -> { sourceCommitId, targetCommitId, title, description }
    |
    +--2--> getLatestIterationId(prInfo)
    |       -> iterationId (number)
    |
    +--3--> getChangedFiles(prInfo, iterationId)
    |       -> IterationChange[] (all changed file paths + changeTypes)
    |
    +--4--> fileFilter.filter(changes)
    |       -> Remove lockfiles, binaries, images, deleted files
    |       -> port.postMessage({ type: 'REVIEW_PROGRESS', payload: { totalFiles } })
    |
    +--5--> FOR EACH file:
    |       |
    |       +-- port.postMessage({ type: 'REVIEW_PROGRESS', payload: { currentFile, fileIndex, totalFiles } })
    |       |
    |       +-- getFileContent(prInfo, filePath, sourceCommitId)
    |       |   -> file content (string)
    |       |
    |       +-- reviewFile(fileContent, filePath, apiKey)  // AI SDK generateText
    |       |   -> { findings: Finding[], summary: string }
    |       |
    |       +-- FOR EACH finding with valid line number:
    |       |   +-- postInlineComment(prInfo, filePath, finding, iterationId)
    |       |
    |       +-- port.postMessage({ type: 'REVIEW_FILE_COMPLETE', payload: result })
    |
    +--6--> buildSummaryMarkdown(allResults)
    |       -> Markdown summary across all files
    |
    +--7--> postSummaryComment(prInfo, summaryMarkdown)
    |
    +--8--> port.postMessage({ type: 'REVIEW_COMPLETE', payload: summary })
    v
[Content Script] Shows completion UI, disconnects port
```

## LLM API Key Storage for Phase 2

Phase 2 needs OpenAI API key storage. Extend the existing `shared/storage.ts`:

```typescript
// Add to shared/storage.ts
export const STORAGE_KEYS = {
  PAT: 'pat',
  AUTH_METHOD: 'auth_method',
  OPENAI_API_KEY: 'openai_api_key',  // New for Phase 2
} as const;

export async function getOpenAiApiKey(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.OPENAI_API_KEY);
  return (result[STORAGE_KEYS.OPENAI_API_KEY] as string) ?? null;
}

export async function setOpenAiApiKey(key: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.OPENAI_API_KEY]: key });
}
```

The options page will need an API key input field for OpenAI. This is a minimal addition to the existing options page UI.

## Manifest Changes

The `wxt.config.ts` needs additional `host_permissions` for the OpenAI API:

```typescript
host_permissions: [
  'https://dev.azure.com/*',
  'https://*.visualstudio.com/*',
  'https://api.openai.com/*',     // New for Phase 2
],
```

## Open Questions

1. **How to get the file diff (not full content) from Azure DevOps?**
   - What we know: Iteration Changes gives changed file PATHS and change types. The Items API gives full file content at a specific commit. There is no direct "diff" endpoint for a single file within a PR iteration.
   - What's unclear: Whether to send full file content to the LLM (more context but more tokens) or compute a diff client-side (less tokens but requires both versions).
   - Recommendation: For Phase 2, fetch the source commit version of each changed file via Items API. Send the full file content to the LLM with the file path and change type. This is simpler and gives the LLM full context. Optimize to diffs in a later phase if token costs are too high. For "edit" changes, fetch both the source version and target version (using the Diffs API `baseVersion`/`targetVersion` or Items at both commits) and compute a simple unified diff.

2. **Should we limit concurrent LLM calls?**
   - What we know: Sequential file review is simple but slow. Parallel calls are faster but risk rate limits and higher cost spikes.
   - What's unclear: OpenAI rate limits vary by account tier.
   - Recommendation: Start with sequential (one file at a time) in Phase 2. This is simpler, avoids rate limit complexity, and the port keepalive pattern works cleanly. Add parallel (3 concurrent) in a future optimization.

3. **Where does the OpenAI API key come from in Phase 2?**
   - What we know: Phase 3 builds the full options page for multi-provider settings. Phase 2 only needs OpenAI.
   - What's unclear: Should Phase 2 build a temporary API key input, or hardcode for development?
   - Recommendation: Extend the existing options page (Phase 1) with a simple OpenAI API key field. This is ~20 lines of code and avoids hardcoding secrets. The Phase 3 options page redesign will replace this.

## Sources

### Primary (HIGH confidence)
- [Azure DevOps REST API v7.1 - Pull Request Threads Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1) -- Thread creation with `threadContext`, `CommentPosition` structure, request/response examples
- [Azure DevOps REST API v7.1 - Pull Request Iteration Changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1) -- Changed files list, pagination, `VersionControlChangeType` enum
- [Azure DevOps REST API v7.1 - Pull Request Iterations](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iterations/list?view=azure-devops-rest-7.1) -- Iteration listing, ID for changes endpoint
- [Azure DevOps REST API v7.1 - Items Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/items/get?view=azure-devops-rest-7.1) -- File content at specific commit, `versionDescriptor` params, `includeContent`
- [Azure DevOps REST API v7.1 - Pull Requests Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-request?view=azure-devops-rest-7.1) -- PR metadata, `lastMergeSourceCommit`, `lastMergeTargetCommit`
- [Azure DevOps REST API v7.1 - Diffs Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/diffs/get?view=azure-devops-rest-7.1) -- Commit diff for changed file list
- [Chrome Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) -- 30s idle timeout, 5min max, port keepalive since Chrome 114+, WebSocket since Chrome 116+
- [Vercel AI SDK Introduction](https://ai-sdk.dev/docs/introduction) -- AI SDK 6.x, `generateText`, `Output.object()`, structured output, Zod integration
- [AI SDK Structured Data Generation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- `Output.object()` with Zod, `NoObjectGeneratedError`, deprecated `generateObject`
- Existing codebase: `shared/messages.ts`, `shared/types.ts`, `lib/auth/manager.ts`, `lib/url-matcher.ts` -- Phase 1 infrastructure

### Secondary (MEDIUM confidence)
- [Vercel AI SDK Chrome Extension Example](https://github.com/vercel-labs/ai-sdk-chrome-extension) -- Confirms AI SDK works in Chrome extension contexts
- [Azure DevOps Rate and Usage Limits](https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops) -- 200 TSTU / 5-min rate limit, throttling headers
- [Chrome Extension Keep-Alive via Port](https://gist.github.com/sunnyguan/f94058f66fab89e59e75b1ac1bf1a06e) -- Community-verified port keepalive pattern

### Tertiary (LOW confidence)
- LLM prompt engineering patterns for code review -- sourced from general research, not verified against specific production systems. The prompt template should be iterated through testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- AI SDK 6.x with `@ai-sdk/openai`, Zod 4.x -- verified via official docs and existing STACK.md decisions
- Architecture: HIGH -- Port-based keepalive, file-by-file review, ADO API client patterns -- verified via Chrome and Azure DevOps official docs
- ADO API integration: HIGH -- All endpoints verified against Microsoft Learn REST API v7.1 docs with example request/response bodies
- LLM prompt engineering: MEDIUM -- Prompt template is a starting point. Needs iteration through real-world testing.
- Pitfalls: HIGH -- Service worker termination, thread positions, file filtering -- verified via official Chrome and Azure DevOps docs plus existing PITFALLS.md research

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable APIs, 30-day validity)
