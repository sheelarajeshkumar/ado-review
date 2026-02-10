# Requirements: PEP Review

**Defined:** 2026-02-10
**Core Value:** One-click AI code review that posts directly to Azure DevOps PRs — no copy-pasting, no context switching.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Extension Core

- [ ] **CORE-01**: Extension activates only on Azure DevOps PR URLs matching `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`
- [ ] **CORE-02**: Review button is injected into the Azure DevOps PR page UI
- [ ] **CORE-03**: Review button handles Azure DevOps SPA navigation (re-injects on route changes)
- [ ] **CORE-04**: User can see review progress (which file is being reviewed, how many remaining)
- [ ] **CORE-05**: Per-file errors are isolated — one file failing does not stop the entire review
- [ ] **CORE-06**: Failed file reviews are retried with exponential backoff

### Azure DevOps Integration

- [ ] **ADO-01**: Extension fetches all changed files in a PR via Azure DevOps REST API v7.1
- [ ] **ADO-02**: Extension authenticates using the user's browser session (cookies)
- [ ] **ADO-03**: Extension falls back to Personal Access Token if session auth fails
- [ ] **ADO-04**: Extension posts inline comments anchored to specific code lines on the PR
- [ ] **ADO-05**: Extension posts a top-level summary comment with the full review overview
- [ ] **ADO-06**: Inline comments include severity tags (Critical/Warning/Info)

### LLM Integration

- [ ] **LLM-01**: Extension supports OpenAI as an LLM provider
- [ ] **LLM-02**: Extension supports Anthropic (Claude) as an LLM provider
- [ ] **LLM-03**: Extension supports Azure OpenAI as an LLM provider
- [ ] **LLM-04**: User can select which LLM provider to use for reviews
- [ ] **LLM-05**: Extension reviews each changed file individually (file-by-file)
- [ ] **LLM-06**: Extension auto-skips non-code files (lockfiles, binaries, images, generated files)
- [ ] **LLM-07**: Extension shows estimated token cost before running a review
- [ ] **LLM-08**: Extension generates a combined summary across all file reviews

### Review Intelligence

- [ ] **REV-01**: User can select from review presets (security, performance, best practices)
- [ ] **REV-02**: Each preset sends a specialized system prompt to the LLM
- [ ] **REV-03**: User can edit the system prompt for full control over review instructions
- [ ] **REV-04**: LLM output includes severity levels (Critical/Warning/Info) per finding

### Settings & UX

- [ ] **UX-01**: Options page for managing API keys per LLM provider
- [ ] **UX-02**: Options page for selecting default LLM provider and model
- [ ] **UX-03**: User can re-review a PR with one click after changes are pushed
- [ ] **UX-04**: Extension stores review history per PR URL
- [ ] **UX-05**: User can view past reviews for a PR without scrolling Azure DevOps comments

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Review Intelligence

- **REV-05**: User can combine multiple presets in one review (e.g., security + performance)
- **REV-06**: User can export/import review presets as JSON for team sharing

### Settings & UX

- **UX-06**: Side panel UI for richer review experience
- **UX-07**: User can configure custom file filter glob patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-fix / auto-commit suggestions | Chrome extension cannot perform git operations; auto-applying LLM code defeats review purpose |
| Full codebase context / repo indexing | Requires server-side infrastructure; contradicts zero-infra value prop |
| Hosted backend / proxy service | Adds infra, hosting costs, security concerns; each user manages own keys |
| Real-time streaming comments to PR | Azure DevOps API rate limits; creates notification spam for PR participants |
| Auto-review on PR creation | Requires webhooks (server-side); wastes API costs without user intent |
| PR description generation | Scope creep; PEP Review is a reviewer, not a PR writing assistant |
| Chat / conversational interface | High UI complexity; fragile Azure DevOps DOM injection; rarely used |
| GitHub / GitLab / Bitbucket support | 10x testing surface; Azure DevOps focus is the product's strength |
| Chrome Web Store publishing | Internal distribution only via sideload or enterprise policy |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | — | Pending |
| CORE-02 | — | Pending |
| CORE-03 | — | Pending |
| CORE-04 | — | Pending |
| CORE-05 | — | Pending |
| CORE-06 | — | Pending |
| ADO-01 | — | Pending |
| ADO-02 | — | Pending |
| ADO-03 | — | Pending |
| ADO-04 | — | Pending |
| ADO-05 | — | Pending |
| ADO-06 | — | Pending |
| LLM-01 | — | Pending |
| LLM-02 | — | Pending |
| LLM-03 | — | Pending |
| LLM-04 | — | Pending |
| LLM-05 | — | Pending |
| LLM-06 | — | Pending |
| LLM-07 | — | Pending |
| LLM-08 | — | Pending |
| REV-01 | — | Pending |
| REV-02 | — | Pending |
| REV-03 | — | Pending |
| REV-04 | — | Pending |
| UX-01 | — | Pending |
| UX-02 | — | Pending |
| UX-03 | — | Pending |
| UX-04 | — | Pending |
| UX-05 | — | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29 ⚠️

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
