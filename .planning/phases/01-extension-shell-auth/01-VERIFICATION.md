---
phase: 01-extension-shell-auth
verified: 2026-02-10T19:50:00Z
status: gaps_found
score: 28/29 must-haves verified
gaps:
  - truth: "Review button imports React hooks correctly"
    status: failed
    reason: "ReviewButton.tsx uses useState without importing it from 'react'"
    artifacts:
      - path: "entrypoints/ado-pr.content/components/ReviewButton.tsx"
        issue: "Missing 'import { useState } from \"react\"' - uses hooks without explicit import"
    missing:
      - "Add 'import { useState } from \"react\"' at top of ReviewButton.tsx"
---

# Phase 1: Extension Shell & Auth Verification Report

**Phase Goal:** Extension is alive on Azure DevOps PR pages -- activates on the right URLs, injects a review button that survives SPA navigation, and authenticates with Azure DevOps

**Verified:** 2026-02-10T19:50:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WXT project builds successfully with `npm run build` | ✓ VERIFIED | Build completes in 1.278s, produces .output/chrome-mv3/ with all entrypoints |
| 2 | URL matcher correctly parses Azure DevOps PR URLs into org/project/repo/prId | ✓ VERIFIED | parsePrUrl() extracts all components with URL decoding, isPullRequestUrl() validates pattern |
| 3 | URL matcher rejects non-PR URLs | ✓ VERIFIED | isPullRequestUrl() returns false for non-matching URLs via regex test |
| 4 | Selector helper tries multiple CSS selectors in order and returns first match | ✓ VERIFIED | querySelector() iterates selectors array, returns first document.querySelector match |
| 5 | Content script activates on any dev.azure.com page | ✓ VERIFIED | Manifest contains matches: ["*://dev.azure.com/*"], content script broad match confirmed |
| 6 | Review button appears only on PR URLs, not on other Azure DevOps pages | ✓ VERIFIED | index.tsx checks isPullRequestUrl() before mounting, tryMount() only called on PR pages |
| 7 | Review button re-appears after SPA navigation to a different PR | ✓ VERIFIED | wxt:locationchange listener removes old UI and calls tryMount() on new PR URLs |
| 8 | Review button disappears when navigating away from a PR page | ✓ VERIFIED | wxt:locationchange checks wasOnPR && !isOnPR, removes currentUi when leaving PR |
| 9 | Only one review button exists at a time (no duplicates after navigation) | ✓ VERIFIED | Module-level currentUi variable, always removed before re-mount |
| 10 | Review button is visually isolated from Azure DevOps styles via Shadow DOM | ✓ VERIFIED | createShadowRootUi with cssInjectionMode: 'ui', styles scoped to shadow root |
| 11 | Background service worker receives CHECK_AUTH messages and returns auth status | ✓ VERIFIED | background.ts handlers['CHECK_AUTH'] calls checkAuth() and returns AuthStatus |
| 12 | Session auth tests against _apis/connectionData with credentials:'include' | ✓ VERIFIED | session.ts testSessionAuth() uses credentials:'include' on fetch (lines 23, 25, 58) |
| 13 | PAT auth uses Basic header with base64(':' + pat) encoding | ✓ VERIFIED | pat.ts line 52: Authorization: Basic ${btoa(':' + pat)} |
| 14 | Auth manager tries session first, falls back to PAT | ✓ VERIFIED | manager.ts checkAuth() calls testSessionAuth first (line 26), then tryPatAuth() (line 32) |
| 15 | Options page allows user to enter and save a PAT | ✓ VERIFIED | options/App.tsx has PAT input form with handleSave() sending SAVE_PAT message |
| 16 | PAT is validated against Azure DevOps before storing | ✓ VERIFIED | pat.ts savePat() calls validatePatFormat() then testPat() before setPat() (lines 108-118) |
| 17 | Invalid PAT shows error message to user | ✓ VERIFIED | options/App.tsx displays feedback.message on result.success === false |
| 18 | Popup shows current auth status | ✓ VERIFIED | popup/App.tsx sends CHECK_AUTH on mount, displays colored status indicator |
| 19 | Review button imports React hooks correctly | ✗ FAILED | ReviewButton.tsx uses useState (lines 20-21) without importing from 'react' |

**Score:** 18/19 truths verified (94.7%)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| wxt.config.ts | WXT configuration with manifest overrides for Azure DevOps | ✓ VERIFIED | Contains host_permissions for dev.azure.com and *.visualstudio.com |
| lib/url-matcher.ts | PR URL parsing and matching | ✓ VERIFIED | Exports parsePrUrl, isPullRequestUrl, buildApiUrl with full implementation |
| lib/selectors.ts | Centralized DOM selectors with fallback strategy | ✓ VERIFIED | Exports SELECTORS, querySelector, checkSelectorHealth, waitForElement |
| shared/types.ts | Shared type definitions including PrInfo | ✓ VERIFIED | Defines PrInfo interface with org/project/repo/prId/baseUrl fields |
| shared/messages.ts | Typed message definitions for communication | ✓ VERIFIED | Contains CHECK_AUTH, AUTH_RESULT, SAVE_PAT, PAT_RESULT discriminated union |
| shared/storage.ts | Storage key definitions and typed helpers | ✓ VERIFIED | Exports getPat, setPat, clearPat using browser.storage.local |
| shared/constants.ts | URL patterns and API base URLs | ✓ VERIFIED | Defines ADO_BASE, ADO_API_VERSION, CONNECTION_DATA_PATH, PAT_LENGTH |
| entrypoints/ado-pr.content/index.tsx | Content script entrypoint with SPA navigation handling | ✓ VERIFIED | Uses defineContentScript, wxt:locationchange, tryMount with currentUi tracking |
| entrypoints/ado-pr.content/App.tsx | React root component receiving prInfo | ✓ VERIFIED | Accepts PrInfo prop, renders ReviewButton |
| entrypoints/ado-pr.content/components/ReviewButton.tsx | Review button React component | ⚠️ ORPHANED | Exists with 81 lines, but missing React hooks import (useState) |
| entrypoints/ado-pr.content/style.css | Scoped styles for shadow root UI | ✓ VERIFIED | 64 lines with Azure DevOps-matching button styles |
| lib/auth/manager.ts | Auth orchestration: session-first with PAT fallback | ✓ VERIFIED | Exports getAuthHeaders, checkAuth with session→PAT→none cascade |
| lib/auth/session.ts | Session cookie auth via service worker fetch | ✓ VERIFIED | Exports testSessionAuth, sessionFetch with credentials:'include' |
| lib/auth/pat.ts | PAT storage, validation, and header generation | ✓ VERIFIED | Exports tryPatAuth, validatePatFormat, testPat, savePat with full validation |
| entrypoints/background.ts | Service worker with message handler registry | ✓ VERIFIED | Uses defineBackground, handlers object with CHECK_AUTH and SAVE_PAT |
| entrypoints/options/App.tsx | Options page with PAT entry form | ✓ VERIFIED | Contains PAT input, validation feedback, auth status display, SAVE_PAT message |
| entrypoints/popup/App.tsx | Popup showing auth status | ✓ VERIFIED | Sends CHECK_AUTH on mount, displays colored status indicator with settings link |

**Artifact Score:** 16/17 verified, 1 with wiring issue (94.1%)

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| lib/url-matcher.ts | shared/types.ts | imports PrInfo type | ✓ WIRED | Line 10: import type { PrInfo } from '@/shared/types' |
| shared/messages.ts | shared/types.ts | uses shared types in message payloads | ✓ WIRED | Line 8: import type { AuthMethod } from '@/shared/types' |
| entrypoints/ado-pr.content/index.tsx | lib/url-matcher.ts | imports isPullRequestUrl and parsePrUrl for URL detection | ✓ WIRED | Line 16: import { parsePrUrl, isPullRequestUrl } from '@/lib/url-matcher' |
| entrypoints/ado-pr.content/index.tsx | lib/selectors.ts | imports SELECTORS for anchor element discovery | ✓ WIRED | Line 15: import { SELECTORS, waitForElement } from '@/lib/selectors' |
| entrypoints/ado-pr.content/index.tsx | wxt:locationchange | ctx.addEventListener for SPA navigation | ✓ WIRED | Line 33: ctx.addEventListener(window, 'wxt:locationchange', ...) |
| entrypoints/ado-pr.content/index.tsx | createShadowRootUi | WXT shadow DOM injection | ✓ WIRED | Line 73: const ui = await createShadowRootUi(ctx, {...}) |
| entrypoints/ado-pr.content/App.tsx | shared/types.ts | receives PrInfo prop | ✓ WIRED | Line 9: import type { PrInfo } from '@/shared/types' |
| entrypoints/background.ts | lib/auth/manager.ts | calls checkAuth on CHECK_AUTH message | ✓ WIRED | Line 14: import { checkAuth } from '@/lib/auth/manager', line 47 usage |
| lib/auth/manager.ts | lib/auth/session.ts | tries session auth first | ✓ WIRED | Line 12: import { testSessionAuth } from '@/lib/auth/session', line 26 call |
| lib/auth/manager.ts | lib/auth/pat.ts | falls back to PAT auth | ✓ WIRED | Line 13: import { tryPatAuth } from '@/lib/auth/pat', line 32 call |
| lib/auth/session.ts | dev.azure.com/_apis/connectionData | fetch with credentials:'include' | ✓ WIRED | Lines 23-29: fetch with credentials:'include' and Accept header |
| lib/auth/pat.ts | shared/storage.ts | reads/writes PAT from chrome.storage.local | ✓ WIRED | Line 9: import { getPat, setPat } from '@/shared/storage', used in functions |
| entrypoints/options/App.tsx | shared/messages.ts | sends SAVE_PAT message to background | ✓ WIRED | Line 2: import { sendMessage }, line 39: sendMessage('SAVE_PAT', ...) |
| entrypoints/background.ts | lib/auth/pat.ts | validates and stores PAT on SAVE_PAT message | ✓ WIRED | Line 15: import { savePat }, line 56: return savePat(payload.pat, ...) |

**Key Links Score:** 14/14 verified (100%)

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| CORE-01: Extension activates only on Azure DevOps PR URLs | ✓ SATISFIED | None - content script uses broad match but conditionally mounts only on isPullRequestUrl() |
| CORE-02: Review button is injected into the Azure DevOps PR page UI | ✓ SATISFIED | None - createShadowRootUi injects button, waitForElement finds anchor |
| CORE-03: Review button handles Azure DevOps SPA navigation | ✓ SATISFIED | None - wxt:locationchange listener handles mount/unmount/re-mount lifecycle |
| ADO-02: Extension authenticates using browser session (cookies) | ✓ SATISFIED | None - session.ts uses credentials:'include' on all fetches |
| ADO-03: Extension falls back to Personal Access Token if session auth fails | ✓ SATISFIED | None - manager.ts cascade: session → PAT → none |

**Requirements Score:** 5/5 satisfied (100%)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| entrypoints/ado-pr.content/components/ReviewButton.tsx | 20-21 | Missing React hooks import (useState) | ⚠️ Warning | Code works due to automatic JSX runtime but violates best practices - should explicitly import useState from 'react' for clarity |
| entrypoints/options/App.tsx | 114 | "placeholder" text attribute | ℹ️ Info | Legitimate use - HTML input placeholder attribute, not a stub |
| entrypoints/background.ts | 38 | console.log startup message | ℹ️ Info | Acceptable diagnostic logging for service worker lifecycle |

**Anti-Patterns Summary:** 1 warning (missing import), 2 info (legitimate uses)

### Human Verification Required

#### 1. Visual: Review button appears in correct location

**Test:** 
1. Load unpacked extension in Chrome
2. Navigate to an Azure DevOps PR page (e.g., https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123)
3. Look for "🔍 PEP Review" button in the PR header actions area

**Expected:** Button appears inline with other PR header buttons, styled with Azure DevOps blue (#0078d4)

**Why human:** Visual positioning and styling can only be verified by seeing the actual rendered UI in Azure DevOps

#### 2. Behavior: SPA navigation re-injects button

**Test:**
1. Start on an Azure DevOps PR page with button visible
2. Click to a different PR in the same browser tab (SPA navigation)
3. Observe button disappears briefly, then reappears
4. Navigate to a non-PR page (e.g., repository files tab)
5. Navigate back to PR

**Expected:** 
- Button disappears on non-PR pages
- Button reappears on PR pages
- No duplicate buttons at any time
- Button shows correct PR context after navigation

**Why human:** SPA navigation behavior requires observing actual route transitions in Azure DevOps

#### 3. Auth: Session authentication works with browser login

**Test:**
1. Ensure logged into Azure DevOps in browser (verify by opening dev.azure.com)
2. Click review button on a PR page
3. Observe button feedback changes to "✓ Authenticated (session)" for 2 seconds

**Expected:** Button shows session auth success if browser has active Azure DevOps session

**Why human:** Requires real Azure DevOps account and browser session state

#### 4. Auth: PAT fallback works when session unavailable

**Test:**
1. Log out of Azure DevOps in browser (or use incognito mode)
2. Open extension options page
3. Enter a valid Azure DevOps PAT (84 characters)
4. Click "Save PAT"
5. Navigate to a PR page and click review button

**Expected:** 
- Options page shows "Using PAT" status
- Button shows "✓ Authenticated (pat)" for 2 seconds
- Invalid PAT shows error message in options page

**Why human:** Requires real PAT and testing error states

#### 5. Edge Case: Button survives rapid navigation

**Test:**
1. Navigate between multiple PRs quickly (click PR links in rapid succession)
2. Observe button behavior during rapid transitions

**Expected:** 
- Only one button instance at any time
- No JavaScript errors in console
- Button eventually settles on correct PR context

**Why human:** Testing race conditions in navigation requires manual interaction timing

### Gaps Summary

**1 gap found blocking 1 truth:**

**Gap 1: Missing React hooks import in ReviewButton component**
- **Truth affected:** "Review button imports React hooks correctly"
- **Status:** Failed
- **Issue:** ReviewButton.tsx uses `useState` (lines 20-21) without importing it from 'react'. The code compiles and builds due to React's automatic JSX runtime (jsx: "react-jsx" in tsconfig), but this violates best practices and could cause issues in different build configurations.
- **Impact:** Low severity - code works in current configuration, but should be fixed for correctness and maintainability
- **Fix:** Add `import { useState } from 'react';` at the top of ReviewButton.tsx

**Root cause:** The automatic JSX runtime makes React hooks globally available without explicit imports. While this works, it's not recommended for clarity and portability.

**Recommendation:** Fix this warning before proceeding to Phase 2. The fix is trivial (one import line) and improves code quality.

---

_Verified: 2026-02-10T19:50:00Z_
_Verifier: Claude (gsd-verifier)_
