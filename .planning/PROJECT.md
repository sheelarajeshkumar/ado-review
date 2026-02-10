# PEP Review — AI Code Review for Azure DevOps

## What This Is

A Chrome extension that adds AI-powered code review to Azure DevOps pull requests. When a user opens a PR on `dev.azure.com`, a review button appears in the UI. Clicking it fetches the PR diff, sends each changed file to a configurable LLM for review, and posts the results back as inline comments and a summary comment on the PR. Built as an internal tool for the PepsiCo team.

## Core Value

One-click AI code review that posts directly to Azure DevOps PRs — no copy-pasting, no context switching.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Chrome extension activates on `dev.azure.com` PR URLs (pattern: `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`)
- [ ] Review button injected into Azure DevOps PR UI
- [ ] Authenticates with Azure DevOps using browser session, falls back to PAT if session unavailable
- [ ] Fetches all changed files in a PR via Azure DevOps REST API
- [ ] Smart filtering — auto-skips non-code files (images, lockfiles, configs, binaries)
- [ ] Reviews each file individually against the LLM (file-by-file to handle large PRs)
- [ ] Generates a summary review across all files
- [ ] Posts inline comments on specific code lines in the PR
- [ ] Posts a top-level summary comment on the PR
- [ ] Supports multiple LLM providers (OpenAI, Anthropic, Azure OpenAI)
- [ ] Settings UI for API key management per provider
- [ ] Settings UI for LLM provider selection
- [ ] Review presets (security, performance, best practices) — user picks focus areas
- [ ] Editable system prompt for full control over review instructions
- [ ] Loading/progress indicator during review

### Out of Scope

- Chrome Web Store publishing — internal distribution only
- GitHub/GitLab/Bitbucket support — Azure DevOps only
- Automated triggering (e.g., auto-review on PR creation) — manual click only
- PR approval/rejection — review comments only, no vote changes
- Chat/conversation with the LLM about specific findings

## Context

- Target domain: `dev.azure.com`
- Example PR URL: `https://dev.azure.com/PepsiCoIT/PEPCommerce_Loyalty/_git/dtcloyalty-runtime-loyalty-engine-activity-api/pullrequest/1366775`
- Azure DevOps REST API provides PR diffs, file contents, and comment threading
- Extension needs to handle the Azure DevOps SPA — page content loads dynamically
- Internal PepsiCo team usage — org-specific patterns and coding standards may be baked into presets

## Constraints

- **Platform**: Chrome extension (Manifest V3)
- **Auth**: Must work within existing Azure DevOps sessions — no separate login flow
- **Distribution**: Sideloaded or enterprise Chrome policy, not public store
- **LLM API keys**: Stored locally in extension storage, never transmitted to third parties

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| File-by-file LLM review | Avoids token limit issues on large PRs | — Pending |
| Session-first auth with PAT fallback | Zero-friction for logged-in users, PAT as escape hatch | — Pending |
| Multiple LLM providers | Team members may have different API access | — Pending |
| Inline + summary comments | Mirrors how human reviewers work — specific feedback + overview | — Pending |

---
*Last updated: 2026-02-10 after initialization*
