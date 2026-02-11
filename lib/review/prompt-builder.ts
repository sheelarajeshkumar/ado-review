/**
 * System and user prompt construction for LLM code review.
 *
 * Builds the prompts sent to the LLM for reviewing individual files.
 * File content is annotated with line numbers and change markers to
 * help the LLM focus on changed lines while using the full file as
 * context (addresses Pitfall 3 from research).
 */

import type { ChangedRange } from '@/lib/ado-api/diff';

/**
 * Build the system prompt for code review.
 *
 * Instructs the LLM on its role, focus areas, and what NOT to comment on.
 *
 * @returns The system prompt string
 */
export function buildSystemPrompt(): string {
  return `You are a senior software engineer performing a code review on a pull request. Your task is to review ONLY the changed lines and identify issues.

Lines prefixed with ">" are CHANGED — these are the lines you must review.
Lines without ">" are UNCHANGED context — use them for understanding but do NOT report findings on unchanged lines.

For each issue you find, provide:
- The exact line number where the issue is located (must be a changed line)
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
- Unchanged lines (lines without the ">" prefix)
- Formatting or whitespace (handled by linters)
- Missing documentation unless critical for understanding
- Subjective style preferences

Be concise. Only report genuine issues in the changed code, not noise. If the changed code is clean, return an empty findings array.`;
}

/**
 * Add line numbers and change markers to code content.
 *
 * Prepends each line with its 1-based line number. Changed lines are
 * additionally prefixed with ">" to visually distinguish them.
 *
 * @param content - Raw file content
 * @param changedRanges - Ranges of changed lines (1-based), or null if entire file is new
 * @returns Content with line numbers and change markers
 */
function addLineNumbers(content: string, changedRanges: ChangedRange[] | null): string {
  const lines = content.split('\n');
  const width = String(lines.length).length;

  return lines
    .map((line, i) => {
      const lineNum = i + 1;
      const isChanged = changedRanges === null || isLineInRanges(lineNum, changedRanges);
      const marker = isChanged ? '>' : ' ';
      return `${marker} ${String(lineNum).padStart(width)} | ${line}`;
    })
    .join('\n');
}

/**
 * Check if a line number falls within any of the changed ranges.
 */
function isLineInRanges(line: number, ranges: ChangedRange[]): boolean {
  return ranges.some((r) => line >= r.startLine && line <= r.endLine);
}

/**
 * Build the user prompt for reviewing a specific file.
 *
 * Includes the file path, change type context, and the full file content
 * annotated with line numbers and change markers.
 *
 * @param filePath - Path to the file being reviewed
 * @param fileContent - The file's source code (full file)
 * @param changeType - The type of change ('add', 'edit', 'rename')
 * @param changedRanges - Ranges of changed lines, or null if entire file is new
 * @returns The user prompt string
 */
export function buildFileReviewPrompt(
  filePath: string,
  fileContent: string,
  changeType: string,
  changedRanges: ChangedRange[] | null = null,
): string {
  const numberedContent = addLineNumbers(fileContent, changedRanges);
  const isNewFile = changeType === 'add' || changedRanges === null;

  if (isNewFile) {
    return `Review the following new file. All lines are new and should be reviewed.

**File:** \`${filePath}\`

\`\`\`
${numberedContent}
\`\`\`

Analyze the code above and report any issues found. If no issues are found, return an empty findings array with a brief positive summary.

Line numbers in your findings must correspond to line numbers in the code block above.`;
  }

  return `Review the changed lines in the following file. Lines prefixed with ">" are CHANGED and should be reviewed. Other lines are context only.

**File:** \`${filePath}\`

\`\`\`
${numberedContent}
\`\`\`

IMPORTANT: Only report issues on changed lines (lines prefixed with ">"). Use the unchanged lines for context and understanding, but do not flag issues in them.

Line numbers in your findings must correspond to line numbers in the code block above.`;
}
