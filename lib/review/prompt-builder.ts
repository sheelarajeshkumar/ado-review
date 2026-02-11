/**
 * System and user prompt construction for LLM code review.
 *
 * Builds the prompts sent to the LLM for reviewing individual files.
 * File content is annotated with line numbers to help the LLM report
 * accurate positions for findings (addresses Pitfall 3 from research).
 */

/**
 * Build the system prompt for code review.
 *
 * Instructs the LLM on its role, focus areas, and what NOT to comment on.
 *
 * @returns The system prompt string
 */
export function buildSystemPrompt(): string {
  return `You are a senior software engineer performing a code review. Your task is to review the changed code and identify issues.

For each issue you find, provide:
- The exact line number where the issue is located
- A severity level: "Critical" (bugs, security issues), "Warning" (code smells, potential issues), or "Info" (style, suggestions)
- A clear, concise description of the issue
- An optional suggestion for how to fix it
- A brief explanation of why this matters — reference best practices, security principles, or performance implications

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

Be concise. Only report genuine issues, not noise. If the code is clean, return an empty findings array.`;
}

/**
 * Add line numbers to code content.
 *
 * Prepends each line with its 1-based line number, formatted as
 * right-aligned number + pipe separator for readability.
 *
 * @param content - Raw file content
 * @returns Content with line numbers prepended to each line
 */
function addLineNumbers(content: string): string {
  const lines = content.split('\n');
  const width = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(width)} | ${line}`)
    .join('\n');
}

/**
 * Build the user prompt for reviewing a specific file.
 *
 * Includes the file path, change type context, and the full file content
 * annotated with line numbers.
 *
 * @param filePath - Path to the file being reviewed
 * @param fileContent - The file's source code
 * @param changeType - The type of change ('add', 'edit', 'rename')
 * @returns The user prompt string
 */
export function buildFileReviewPrompt(
  filePath: string,
  fileContent: string,
  changeType: string,
): string {
  const numberedContent = addLineNumbers(fileContent);
  const changeContext = changeType === 'add' ? 'new' : 'changed';

  return `Review the following ${changeContext} file.

**File:** \`${filePath}\`

\`\`\`
${numberedContent}
\`\`\`

Analyze the code above and report any issues found. If no issues are found, return an empty findings array with a brief positive summary.

Line numbers in your findings must correspond to line numbers in the code block above.`;
}
