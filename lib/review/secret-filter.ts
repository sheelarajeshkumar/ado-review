/**
 * Regex-based secret scanner and redactor.
 *
 * Scans file content for common secrets and credentials (AWS keys,
 * API keys, connection strings, tokens, etc.) and replaces them
 * with [REDACTED:<name>] placeholders before sending to the LLM.
 */

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS_ACCESS_KEY', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'GENERIC_API_KEY', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi },
  { name: 'GENERIC_SECRET', pattern: /(?:secret[_-]?key|client[_-]?secret)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi },
  { name: 'CONNECTION_STRING', pattern: /(?:connection[_-]?string|database[_-]?url|mongodb(?:\+srv)?:\/\/)\S+/gi },
  { name: 'BEARER_TOKEN', pattern: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g },
  { name: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'GITHUB_PAT', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: 'PASSWORD_ASSIGNMENT', pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi },
];

/**
 * Scan content for secrets and replace matches with redaction placeholders.
 *
 * @param content - Raw file content
 * @returns Object with redacted content and count of redactions applied
 */
export function redactSecrets(content: string): { redacted: string; redactedCount: number } {
  let redacted = content;
  let redactedCount = 0;

  for (const { name, pattern } of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, () => {
      redactedCount++;
      return `[REDACTED:${name}]`;
    });
  }

  return { redacted, redactedCount };
}
