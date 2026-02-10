---
phase: 02-pr-review-pipeline
plan: 02
subsystem: review, api
tags: [openai, ai-sdk, vercel-ai, generateText, structured-output, orchestrator, port-messaging, error-isolation]

# Dependency graph
requires:
  - phase: 02-pr-review-pipeline
    plan: 01
    provides: "ADO API client, PR fetching, file content, threads, Zod schemas, file filter, retry, prompt builder, PortMessage types, storage"
provides:
  - "LLM reviewer (reviewSingleFile) via AI SDK generateText + Output.object"
  - "Comment mapper (postFileFindings) with line number validation and drop tracking"
  - "Summary markdown builder (buildSummaryMarkdown) with severity counts table"
  - "Review orchestrator (runReview) with full pipeline coordination and error isolation"
  - "Background port handler for review sessions via browser.runtime.onConnect"
affects: [02-03-ui, 03-multi-provider]

# Tech tracking
tech-stack:
  added: []
  patterns: [generateText + Output.object for structured LLM output, port-based review session lifecycle, per-file error isolation]

key-files:
  created:
    - lib/review/llm-reviewer.ts
    - lib/review/comment-mapper.ts
    - lib/review/orchestrator.ts
  modified:
    - entrypoints/background.ts

key-decisions:
  - "Used maxOutputTokens (AI SDK 6.x API) instead of maxTokens -- plan specified maxTokens but AI SDK 6.x renamed it"
  - "All port.postMessage calls wrapped in try/catch for disconnect resilience"

patterns-established:
  - "LLM review pattern: createOpenAI per-call with runtime API key, generateText with Output.object for Zod-validated structured output"
  - "Error isolation: each file reviewed in try/catch, failures recorded as error results, pipeline continues to next file"
  - "Port lifecycle: background.ts onConnect listener filters by port.name='review', forwards PortMessage objects from orchestrator"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 2 Plan 2: Review Pipeline Core Summary

**LLM reviewer via AI SDK generateText with structured output, comment mapper with line validation, orchestrator with per-file error isolation, and background port handler for review sessions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T15:17:02Z
- **Completed:** 2026-02-10T15:19:59Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Built LLM reviewer that sends single files to OpenAI via AI SDK generateText with Zod-validated structured output
- Built comment mapper that posts findings as inline PR comments with line number validation (drops invalid lines) and generates summary markdown with severity counts
- Built orchestrator that coordinates the full review pipeline: fetch PR, filter files, review with retry, post comments, build and post summary -- with per-file error isolation (CORE-05)
- Added port connection handler to background service worker for long-lived review sessions with disconnect resilience

## Task Commits

Each task was committed atomically:

1. **Task 1: Create LLM reviewer and comment mapper** - `4cb578d` (feat)
2. **Task 2: Create orchestrator and background port handler** - `5cd8cd3` (feat)

## Files Created/Modified
- `lib/review/llm-reviewer.ts` - Single-file LLM review via AI SDK generateText with Output.object and FileReviewSchema
- `lib/review/comment-mapper.ts` - Posts findings as inline comments with line validation; builds summary markdown table with severity counts
- `lib/review/orchestrator.ts` - Top-level review coordinator: fetches PR data, filters files, reviews with retry, posts comments, builds summary, sends progress
- `entrypoints/background.ts` - Added onConnect port listener for review sessions alongside existing onMessage handler

## Decisions Made
- Used `maxOutputTokens` instead of `maxTokens` in AI SDK 6.x generateText call. The plan specified `maxTokens` but AI SDK 6.x renamed it to `maxOutputTokens`. Auto-fixed (Rule 1).
- All `port.postMessage` calls in background.ts are wrapped in try/catch to handle port disconnection gracefully (user navigates away mid-review).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used maxOutputTokens instead of maxTokens for AI SDK 6.x**
- **Found during:** Task 1 (Create LLM reviewer)
- **Issue:** Plan specified `maxTokens: 4000` but AI SDK 6.x uses `maxOutputTokens`. TypeScript compilation failed with "property does not exist" error.
- **Fix:** Changed `maxTokens` to `maxOutputTokens` in the generateText call.
- **Files modified:** lib/review/llm-reviewer.ts
- **Verification:** `pnpm exec tsc --noEmit` passes.
- **Committed in:** 4cb578d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug - incorrect API parameter name)
**Impact on plan:** Trivial parameter rename to match actual AI SDK 6.x API. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Review pipeline is end-to-end functional from a port message trigger
- Plan 02-03 can connect the UI: content script sends START_REVIEW over port, receives REVIEW_PROGRESS/REVIEW_FILE_COMPLETE/REVIEW_COMPLETE/REVIEW_ERROR messages
- All 8 review modules complete in lib/review/
- Background service worker handles both one-shot messages (auth) and long-lived ports (review)

## Self-Check: PASSED

All 3 created files verified on disk. All 2 task commit hashes verified in git log.

---
*Phase: 02-pr-review-pipeline*
*Completed: 2026-02-10*
