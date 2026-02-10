# Roadmap: PEP Review

## Overview

PEP Review delivers one-click AI code review for Azure DevOps PRs as a Chrome extension. The roadmap moves from a working extension shell on Azure DevOps (Phase 1), through a complete end-to-end review pipeline with one LLM provider (Phase 2), to multi-provider support with a settings UI (Phase 3), and finally review presets and UX polish that make the tool a daily driver (Phase 4). Each phase delivers a verifiable capability -- the extension gets more useful at every boundary.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Extension Shell & Auth** - Extension activates on Azure DevOps PR pages with review button and working auth
- [ ] **Phase 2: PR Review Pipeline** - End-to-end AI code review with inline comments and summary posted to PR
- [ ] **Phase 3: Multi-Provider & Settings** - All three LLM providers supported with options page for configuration
- [ ] **Phase 4: Review Intelligence & History** - Review presets, custom prompts, re-review, and review history

## Phase Details

### Phase 1: Extension Shell & Auth
**Goal**: Extension is alive on Azure DevOps PR pages -- activates on the right URLs, injects a review button that survives SPA navigation, and authenticates with Azure DevOps
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, ADO-02, ADO-03
**Success Criteria** (what must be TRUE):
  1. Extension activates only on Azure DevOps PR URLs and does nothing on other pages
  2. A review button appears in the Azure DevOps PR page UI
  3. Review button reappears after navigating between PRs without a full page reload (SPA navigation)
  4. Extension authenticates with Azure DevOps using the browser session, and falls back to PAT entry when session auth fails
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — WXT project scaffold + shared infrastructure (types, URL matcher, selectors, messages)
- [x] 01-02-PLAN.md — Content script with SPA navigation + Shadow DOM review button
- [x] 01-03-PLAN.md — Auth module (session + PAT fallback) + background service worker + options/popup pages

### Phase 2: PR Review Pipeline
**Goal**: User can click the review button and get a complete AI code review -- each changed file reviewed individually, inline comments posted on specific lines with severity, summary comment posted on the PR, with clear progress and resilient error handling
**Depends on**: Phase 1
**Requirements**: ADO-01, ADO-04, ADO-05, ADO-06, LLM-01, LLM-05, LLM-06, LLM-08, CORE-04, CORE-05, CORE-06, REV-04
**Success Criteria** (what must be TRUE):
  1. User clicks review button and sees progress showing which file is being reviewed and how many remain
  2. After review completes, inline comments appear on specific changed lines in the PR with severity tags (Critical/Warning/Info)
  3. A top-level summary comment appears on the PR with an overview across all reviewed files
  4. Non-code files (lockfiles, binaries, images) are automatically skipped without user intervention
  5. If one file fails to review, the remaining files still complete and the user sees which files had errors
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Multi-Provider & Settings
**Goal**: User can choose between OpenAI, Anthropic, and Azure OpenAI as their LLM provider, configure API keys through an options page, and see estimated cost before running a review
**Depends on**: Phase 2
**Requirements**: LLM-02, LLM-03, LLM-04, LLM-07, UX-01, UX-02
**Success Criteria** (what must be TRUE):
  1. User can open the options page and enter API keys for OpenAI, Anthropic, and Azure OpenAI
  2. User can select which LLM provider and model to use as default for reviews
  3. Reviews work correctly when switching between any of the three providers
  4. Before starting a review, user can see estimated token cost for the current PR
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Review Intelligence & History
**Goal**: User has smart review presets for focused reviews, full control over prompts, one-click re-review, and review history per PR
**Depends on**: Phase 3
**Requirements**: REV-01, REV-02, REV-03, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. User can select a review preset (security, performance, best practices) and the review focuses on that area
  2. User can edit the system prompt to customize what the LLM looks for
  3. User can re-review a PR with one click after new changes are pushed
  4. User can view past reviews for a PR without scrolling through Azure DevOps comments
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Extension Shell & Auth | 3/3 | ✓ Complete | 2026-02-10 |
| 2. PR Review Pipeline | 0/TBD | Not started | - |
| 3. Multi-Provider & Settings | 0/TBD | Not started | - |
| 4. Review Intelligence & History | 0/TBD | Not started | - |
