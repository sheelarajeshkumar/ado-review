---
phase: 02-pr-review-pipeline
plan: 01
subsystem: api, review
tags: [azure-devops, rest-api, zod, ai-sdk, openai, file-filter, retry, prompts]

# Dependency graph
requires:
  - phase: 01-extension-shell-auth
    provides: "Auth manager (getAuthHeaders), URL parser, shared types/storage/constants, options page"
provides:
  - "ADO API client (adoFetch) with session/PAT auth"
  - "PR details, iterations, changed files fetching with pagination"
  - "File content retrieval at specific commits"
  - "Inline and summary comment posting to PR threads"
  - "Zod schemas for LLM output validation (Finding, FileReview)"
  - "File filter for non-code files (extensions, filenames, path patterns)"
  - "Exponential backoff retry utility (CORE-06)"
  - "LLM prompt builder with line-numbered code blocks"
  - "PortMessage union for review session communication"
  - "OpenAI API key storage and options page input"
affects: [02-02-orchestrator, 02-03-ui, 03-multi-provider]

# Tech tracking
tech-stack:
  added: [ai@6.x, @ai-sdk/openai@3.x]
  patterns: [adoFetch wrapper, Zod schema validation, port-based messaging, line-numbered prompts]

key-files:
  created:
    - lib/ado-api/types.ts
    - lib/ado-api/client.ts
    - lib/ado-api/pull-requests.ts
    - lib/ado-api/file-content.ts
    - lib/ado-api/threads.ts
    - lib/review/types.ts
    - lib/review/schemas.ts
    - lib/review/file-filter.ts
    - lib/review/retry.ts
    - lib/review/prompt-builder.ts
  modified:
    - shared/types.ts
    - shared/messages.ts
    - shared/storage.ts
    - shared/constants.ts
    - wxt.config.ts
    - entrypoints/options/App.tsx
    - package.json

key-decisions:
  - "Created schemas.ts in Task 2 (alongside ADO client) because threads.ts imports Finding type -- unblocks cross-module dependency"
  - "Used numeric changeType enum in IterationChange (matches ADO API response) with CHANGE_TYPE_MAP for conversion"
  - "Added 150ms minimum delay between comment POST requests to prevent ADO rate limiting (Pitfall 6)"
  - "Line numbers prepended to file content in prompts to improve LLM line-number accuracy (Pitfall 3)"

patterns-established:
  - "adoFetch pattern: all ADO API calls go through single wrapper with auth injection and error handling"
  - "Zod schema validation: all LLM output validated before use via FindingSchema/FileReviewSchema"
  - "File filter constants in shared/constants.ts, logic in lib/review/file-filter.ts"
  - "PortMessage type for long-lived port communication (separate from sendMessage one-shot messages)"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 2 Plan 1: Pipeline Foundation Modules Summary

**ADO API client with auth integration, Zod-validated review schemas, file filter, retry utility, and LLM prompt builder -- all composable modules for the review orchestrator**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T15:08:48Z
- **Completed:** 2026-02-10T15:14:12Z
- **Tasks:** 3
- **Files modified:** 17 (10 created, 7 modified)

## Accomplishments
- Built complete ADO API client layer (5 modules) with authenticated fetch, PR data fetching, file content retrieval, and comment posting
- Built review utility layer (5 modules) with Zod schemas, file filtering, retry with exponential backoff, and LLM prompt construction
- Extended shared modules with ReviewProgress/FileReviewResult/ReviewSummary types, PortMessage union, OpenAI key storage, and file filter constants
- Added OpenAI API key input to options page and api.openai.com host permission

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and extend shared modules** - `5eb3bcb` (feat)
2. **Task 2: Create ADO API client module** - `d959731` (feat)
3. **Task 3: Create review utility modules** - `8d0c062` (feat)

## Files Created/Modified
- `lib/ado-api/types.ts` - ADO REST API response type definitions (AdoPullRequest, IterationChange, ThreadContext, etc.)
- `lib/ado-api/client.ts` - Authenticated fetch wrapper (adoFetch) with session/PAT support and AdoApiError
- `lib/ado-api/pull-requests.ts` - PR details, latest iteration ID, changed files with pagination
- `lib/ado-api/file-content.ts` - File content retrieval at specific commit via Items API
- `lib/ado-api/threads.ts` - Inline and summary comment posting with 150ms rate-limit delay
- `lib/review/types.ts` - Internal pipeline types (ReviewContext, ReviewableFile, SingleFileResult)
- `lib/review/schemas.ts` - Zod schemas for LLM output (FindingSchema, FileReviewSchema, SummaryInputSchema)
- `lib/review/file-filter.ts` - shouldSkipFile (extension/filename/path) and shouldSkipByChangeType
- `lib/review/retry.ts` - retryWithBackoff with exponential backoff and jitter (CORE-06)
- `lib/review/prompt-builder.ts` - buildSystemPrompt and buildFileReviewPrompt with line-numbered code
- `shared/types.ts` - Added ReviewProgress, FileReviewResult, ReviewSummary interfaces
- `shared/messages.ts` - Added PortMessage discriminated union for review port
- `shared/storage.ts` - Added OPENAI_API_KEY storage key, getOpenAiApiKey, setOpenAiApiKey
- `shared/constants.ts` - Added SKIP_EXTENSIONS, SKIP_FILENAMES, SKIP_PATH_PATTERNS
- `wxt.config.ts` - Added https://api.openai.com/* to host_permissions
- `entrypoints/options/App.tsx` - Added OpenAI API key input under LLM Configuration section
- `package.json` - Added ai@6.x and @ai-sdk/openai@3.x dependencies

## Decisions Made
- Created `lib/review/schemas.ts` in Task 2 (alongside ADO client) rather than Task 3, because `threads.ts` imports `Finding` type from it. This is a dependency ordering issue -- deviation Rule 3 auto-fix.
- Used numeric `changeType` in `IterationChange` interface (matching raw ADO API response) with `CHANGE_TYPE_MAP` constant for human-readable conversion.
- Added 150ms minimum delay between comment POST requests to prevent Azure DevOps rate limiting (addresses Pitfall 6 from research).
- Line numbers are prepended to file content in LLM prompts to improve line-number accuracy in findings (addresses Pitfall 3 from research).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created schemas.ts in Task 2 instead of Task 3**
- **Found during:** Task 2 (Create ADO API client module)
- **Issue:** `threads.ts` imports `Finding` from `@/lib/review/schemas`, but that file was planned for Task 3. TypeScript compilation fails without it.
- **Fix:** Created the full `lib/review/schemas.ts` in Task 2, since it was a dependency for the ADO API threads module.
- **Files modified:** lib/review/schemas.ts
- **Verification:** `pnpm exec tsc --noEmit` passes. File content matches plan spec exactly.
- **Committed in:** d959731 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** File created one task earlier than planned due to cross-module dependency. No scope creep -- file content identical to spec.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All foundation modules complete and type-checked
- ADO API client ready for orchestrator (Plan 02-02) to compose into review flow
- Zod schemas ready for LLM reviewer (Plan 02-02) to validate AI output
- PortMessage types ready for content script UI (Plan 02-03) to handle review communication
- OpenAI API key storage ready for LLM calls in orchestrator

## Self-Check: PASSED

All 10 created files verified on disk. All 3 task commit hashes verified in git log.

---
*Phase: 02-pr-review-pipeline*
*Completed: 2026-02-10*
