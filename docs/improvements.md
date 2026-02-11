# AI-Powered Code Review Extension: Key Components

---

## Completed

### 1. Multi-Agent Support

* **Description:** The ability to use different AI agents (e.g., GPT-4 for code logic, a smaller model for style checks) within the same review session.
* **What we can achieve:** This optimizes both **accuracy and speed**. By leveraging the right model for the right task, you get faster feedback without sacrificing the depth of analysis.
* **Example:** A quick style check can be done with a lightweight model, while complex architectural feedback can be handled by a more powerful model, all within the same interface.
* Able to switch between models based on the type of feedback needed, ensuring that the AI's suggestions are both relevant and timely.
* Able to configure different providers for different tasks, such as using a local model for sensitive code and a cloud-based model for general suggestions — OpenAI, Gemini, Claude, local Ollama, etc.
* User can configure these settings in the extension's options page, allowing for a personalized AI review experience that fits their specific workflow and security requirements.

#### Implementation Summary
* **Supported providers:** OpenAI, Anthropic Claude, Google Gemini, Ollama (local)
* **Options page:** Provider dropdown, model input, conditional API key/base URL fields
* **Backward compatible:** Existing OpenAI-only users auto-migrate without reconfiguration
* **Ollama:** Uses OpenAI-compatible API with custom base URL, no API key needed
* **OpenAI:** Supports optional base URL for Azure OpenAI deployments

### 2. Multi-Model Context Engine

* **Description:** A backend logic that uses different models for different tasks (e.g., a fast model for typos and a large model for architectural logic) while pulling in project-specific documentation and style guides.
* **What we can achieve:** This ensures the AI doesn't just give generic advice. It provides **context-aware reviews** that understand your specific codebase, reducing "hallucinations" and irrelevant suggestions.

#### Implementation Summary
* **Fast model routing:** Files with ≤150 lines are automatically routed to the configured fast model; larger files use the main (deep) model
* **Configuration:** Optional `fastModel` and `fastProvider` fields on the existing `AiProviderConfig`
* **Options UI:** Collapsible "Fast Model (optional)" section with provider dropdown and model text input
* **Backward compatible:** Configs without `fastModel` behave exactly as before — the main model handles everything
* **Helper:** `getFastConfig()` in `llm-reviewer.ts` swaps the model/provider only when a fast model is configured

### 3. Explainable AI Findings

* **Description:** Each finding now includes a structured "Why" explanation that references best practices, security principles, or performance implications — turning reviews into a mentorship tool.
* **What we can achieve:** It serves as a **mentorship tool**. Instead of just "fixing" things, it educates the developer, helping junior team members learn the "why" behind senior-level architectural decisions.

#### Implementation Summary
* **Schema:** `why` field added to `FindingSchema` (Zod) and `Finding` interface
* **Prompt:** System prompt instructs the LLM to provide a "why" for every finding
* **Panel UI:** "Why" block renders below each finding's suggestion with subtle styling
* **PR comments:** Inline comments posted to Azure DevOps now include a `**Why:**` line
* **Backward compatible:** The `why` field is always present in new reviews; older cached results without it are handled gracefully via `f.why &&` guard

### 4. Semantic PII & Secret Filter

* **Description:** A pre-processing layer that scans the code for API keys, passwords, or sensitive internal data before it is ever sent to the AI model.
* **What we can achieve:** This builds **enterprise trust**. You can confidently use the tool in professional environments knowing that proprietary data and credentials are never leaked to external LLM providers.

#### Implementation Summary
* **Scanner:** `secret-filter.ts` with regex patterns for AWS keys, generic API keys, secrets, connection strings, bearer tokens, PEM private key blocks, GitHub PATs, and password assignments
* **Redaction:** Matches are replaced with `[REDACTED:<pattern_name>]` placeholders before file content reaches the LLM
* **Integration:** Called in `orchestrator.ts` review loop — `redactSecrets(raw)` wraps every `getFileContent` result
* **Zero config:** Runs automatically on every review with no user-facing settings required

### 5. Shadow DOM In-Line Overlays

* **Description:** UI elements injected directly into the webpage (like GitHub's PR view) using a Shadow DOM to prevent your extension's styles from breaking the website's layout.
* **What we can achieve:** This provides **seamless integration**. Reviewers can see AI suggestions exactly where the code sits, eliminating the need to jump back and forth between the code and a separate AI window.

#### Implementation Summary
* **Marker injection:** After review completes, colored severity dots (Critical/Warning/Info) are injected next to lines with findings in the Azure DevOps diff view
* **DOM probing:** Multiple selector strategies with fallbacks for file headers and line elements; graceful degradation when selectors don't match
* **Shadow DOM popover:** Clicking a dot shows an isolated popover with finding details (severity badge, message, suggestion, why) — styles don't leak into host page
* **MutationObserver:** Watches the diff container and re-applies markers when Azure DevOps re-renders lines (e.g. on scroll or expand)
* **Cleanup:** `clearAnnotations()` removes all markers and the popover on discard, review-again, or unmount

### 6. One-Click Refactor (Copy Fix)

* **Description:** "Copy Fix" buttons placed next to every suggestion — in both the review panel and inline popovers — that copy the suggestion text to clipboard with a single click.
* **What we can achieve:** This significantly **increases developer velocity**. It transforms the tool from a "commenting assistant" into an "automated editor," removing the friction of manual copy-pasting during the review loop.

#### Implementation Summary
* **Panel button:** `CopyFixButton` React component inside each `.pep-finding-suggestion` block; shows "Copied!" for 2 seconds after click
* **Popover button:** HTML "Copy Fix" button in the Shadow DOM popover with the same behavior
* **Clipboard API:** Uses `navigator.clipboard.writeText()` with graceful error handling

---

## Component Overview

| Component | Primary Goal | User Impact | Status |
| --- | --- | --- | --- |
| **Multi-Agent Support** | Flexibility | Right model for the task. | Done |
| **Context Engine** | Accuracy | Fewer irrelevant comments. | Done |
| **Explainable Findings** | Education | Long-term team growth. | Done |
| **PII Filter** | Security | Compliance and data safety. | Done |
| **In-Line Overlays** | Workflow | Zero context-switching. | Done |
| **One-Click Refactor** | Speed | Instant PR updates. | Done |
