# AI-Powered Code Review Extension: Key Components

## 1. Multi-Model Context Engine

* **Description:** A backend logic that uses different models for different tasks (e.g., a fast model for typos and a large model for architectural logic) while pulling in project-specific documentation and style guides.
* **What we can achieve:** This ensures the AI doesn’t just give generic advice. It provides **context-aware reviews** that understand your specific codebase, reducing "hallucinations" and irrelevant suggestions.

## 2. Shadow DOM In-Line Overlays

* **Description:** UI elements injected directly into the webpage (like GitHub’s PR view) using a Shadow DOM to prevent your extension's styles from breaking the website's layout.
* **What we can achieve:** This provides **seamless integration**. Reviewers can see AI suggestions exactly where the code sits, eliminating the need to jump back and forth between the code and a separate AI window.

## 3. "Explainable AI" Side Panel

* **Description:** A persistent side panel (using the Chrome Side Panel API) that breaks down complex suggestions into "The Problem," "The Fix," and "The Why" (referencing specific best practices).
* **What we can achieve:** It serves as a **mentorship tool**. Instead of just "fixing" things, it educates the developer, helping junior team members learn the "why" behind senior-level architectural decisions.

## 4. Semantic PII & Secret Filter

* **Description:** A pre-processing layer that scans the code for API keys, passwords, or sensitive internal data before it is ever sent to the AI model.
* **What we can achieve:** This builds **enterprise trust**. You can confidently use the tool in professional environments knowing that proprietary data and credentials are never leaked to external LLM providers.

## 5. One-Click Refactor (DOM Bridge)

* **Description:** A bridge between the AI’s suggestion and the browser’s text input fields that allows a user to "Apply Fix" with a single click.
* **What we can achieve:** This significantly **increases developer velocity**. It transforms the tool from a "commenting assistant" into an "automated editor," removing the friction of manual copy-pasting during the review loop.

## 6. Multi agent support ✅ DONE

* **Description:** The ability to use different AI agents (e.g., GPT-4 for code logic, a smaller model for style checks) within the same review session.
* **What we can achieve:** This optimizes both **accuracy and speed**. By leveraging the right model for the right task, you get faster feedback without sacrificing the depth of analysis.
** **Example:** A quick style check can be done with a lightweight model, while complex architectural feedback can be handled by a more powerful model, all within the same interface.
* Able to switch between models based on the type of feedback needed, ensuring that the AI's suggestions are both relevant and timely.
* Able to configure diffrent providers for different tasks, such as using a local model for sensitive code and a cloud-based model for general suggestions. openai, gemni, calude, local ollama, etc.
* User should able to configure these settings in the extension's options page, allowing for a personalized AI review experience that fits their specific workflow and security requirements.

### Implementation Summary
* **Supported providers:** OpenAI, Anthropic Claude, Google Gemini, Ollama (local)
* **Options page:** Provider dropdown, model input, conditional API key/base URL fields
* **Backward compatible:** Existing OpenAI-only users auto-migrate without reconfiguration
* **Ollama:** Uses OpenAI-compatible API with custom base URL, no API key needed
* **OpenAI:** Supports optional base URL for Azure OpenAI deployments

---

## Component Overview

| Component | Primary Goal | User Impact |
| --- | --- | --- |
| **Context Engine** | Accuracy | Fewer irrelevant comments. |
| **In-Line Overlays** | Workflow | Zero context-switching. |
| **Explainable Side Panel** | Education | Long-term team growth. |
| **PII Filter** | Security | Compliance and data safety. |
| **One-Click Refactor** | Speed | Instant PR updates. |
