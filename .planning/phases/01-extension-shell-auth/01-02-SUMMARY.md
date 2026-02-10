---
phase: 01-extension-shell-auth
plan: 02
subsystem: ui
tags: [wxt, react, content-script, shadow-dom, spa-navigation, azure-devops]

# Dependency graph
requires:
  - phase: 01-01
    provides: "WXT project, shared types (PrInfo), URL matcher, DOM selectors, typed messages"
provides:
  - "Content script entrypoint with SPA navigation handling for Azure DevOps"
  - "Shadow DOM-isolated React review button injected on PR pages"
  - "ReviewButton component that sends CHECK_AUTH message and shows auth feedback"
  - "CSS styles scoped to shadow root matching Azure DevOps design language"
affects: [01-03-PLAN, 02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [createShadowRootUi-react-mounting, wxt-locationchange-spa-detection, module-level-ui-tracking]

key-files:
  created:
    - entrypoints/ado-pr.content/index.tsx
    - entrypoints/ado-pr.content/style.css
    - entrypoints/ado-pr.content/components/ReviewButton.tsx
  modified:
    - entrypoints/ado-pr.content/App.tsx
    - entrypoints/background.ts
    - tsconfig.json

key-decisions:
  - "Used InstanceType<typeof ContentScriptContext> for ctx parameter typing -- WXT auto-imports ContentScriptContext as a value (class), not a type"
  - "Used setTimeout (not ctx.setTimeout) in ReviewButton for UI feedback timer -- component runs inside shadow root, not affected by context invalidation"

patterns-established:
  - "Shadow DOM mounting: createShadowRootUi with onMount creating ReactDOM.Root, onRemove calling unmount"
  - "SPA lifecycle: module-level currentUi variable, remove before re-mount, null after remove"
  - "Content script broad match: *://dev.azure.com/* with isPullRequestUrl conditional mounting"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 1 Plan 2: Content Script + Review Button Summary

**Shadow DOM-isolated React review button injected on Azure DevOps PR pages with SPA navigation handling via wxt:locationchange and CHECK_AUTH message passing to background service worker**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T14:07:58Z
- **Completed:** 2026-02-10T14:13:08Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Content script entrypoint matches all dev.azure.com pages, conditionally mounts review button only on PR URLs
- SPA navigation handled via wxt:locationchange with proper mount/unmount/re-mount lifecycle preventing duplicate buttons
- ReviewButton component sends CHECK_AUTH message on click and shows auth status feedback (session/PAT/unauthenticated) for 2 seconds
- Shadow DOM isolation via createShadowRootUi with Azure DevOps-matching button styles (#0078d4 accent)

## Task Commits

Each task was committed atomically:

1. **Task 1: Content script entrypoint with SPA navigation and Shadow DOM injection** - `0cdddc9` (feat) -- pre-existing from prior execution
2. **Task 2: ReviewButton and App React components** - `367e16b` (feat)

## Files Created/Modified
- `entrypoints/ado-pr.content/index.tsx` - Content script: defineContentScript with broad match, wxt:locationchange, tryMount with waitForElement + createShadowRootUi
- `entrypoints/ado-pr.content/style.css` - Shadow DOM scoped styles: button base, hover, active, disabled, and state variants (checking, authenticated, unauthenticated)
- `entrypoints/ado-pr.content/App.tsx` - Thin React wrapper passing prInfo to ReviewButton
- `entrypoints/ado-pr.content/components/ReviewButton.tsx` - Review button with CHECK_AUTH message on click and visual auth feedback
- `entrypoints/background.ts` - Fixed Browser.runtime.MessageSender type (was chrome.runtime.MessageSender)
- `tsconfig.json` - Added jsx: "react-jsx" compiler option

## Decisions Made
- Used `InstanceType<typeof ContentScriptContext>` for typing the ctx parameter in tryMount -- WXT auto-imports ContentScriptContext as a value (class constructor), not a type, so direct use as a type annotation produces TS2749
- Used native `setTimeout` in ReviewButton for the 2-second feedback timer rather than `ctx.setTimeout` -- the component runs inside React's lifecycle within the shadow root, and ctx is not available at the component level; the timer is short-lived and non-critical

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chrome.runtime.MessageSender to Browser.runtime.MessageSender in background.ts**
- **Found during:** Task 1 (TypeScript type check)
- **Issue:** Pre-existing bug from Plan 01 -- background.ts used `chrome.runtime.MessageSender` which doesn't exist in WXT's type system. WXT provides types via `@wxt-dev/browser` as `Browser.runtime.MessageSender`.
- **Fix:** Changed type annotation from `chrome.runtime.MessageSender` to `Browser.runtime.MessageSender`
- **Files modified:** entrypoints/background.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 0cdddc9 (part of prior execution, verified present)

**2. [Rule 3 - Blocking] Added jsx: "react-jsx" to tsconfig.json**
- **Found during:** Task 1 (TypeScript type check)
- **Issue:** WXT-generated tsconfig.json does not set the `jsx` compiler option. TSX files fail to compile with error TS17004: "Cannot use JSX unless the '--jsx' flag is provided."
- **Fix:** Added `"compilerOptions": { "jsx": "react-jsx" }` to the project tsconfig.json that extends the WXT-generated one
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 0cdddc9 (part of prior execution, verified present)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Task 1 files were already present from a prior partial execution (commit `0cdddc9`). Verified the existing code matches all plan requirements and proceeded to Task 2 without re-committing identical files.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Content script and review button are fully functional -- ready for end-to-end auth testing with Plan 03's auth module
- The CHECK_AUTH message flow from ReviewButton through sendMessage to the background handler is wired up
- Phase 2 will extend the button click handler to trigger the actual review pipeline

## Self-Check: PASSED

All key files verified present. Task commits verified in git log. Build succeeds. TypeScript compiles cleanly.

---
*Phase: 01-extension-shell-auth*
*Completed: 2026-02-10*
