/**
 * Inline diff annotations for ADO Review.
 *
 * After a review completes, injects colored severity dots into the Azure DevOps
 * diff view next to lines that have findings. Clicking a dot shows a Shadow DOM
 * popover with finding details and a "Copy Fix" button.
 *
 * Graceful degradation: if the diff DOM doesn't match any known selectors the
 * module silently no-ops — the panel always works regardless.
 */

import type { FileReviewResult, Finding } from '@/shared/types';
import { SELECTORS, querySelectorAllFallback } from '@/lib/selectors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKER_ATTR = 'data-ado-review-marker';
const POPOVER_HOST_ID = 'ado-review-popover-host';
const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#d13438',
  Warning: '#c87d00',
  Info: '#0078d4',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let cachedFileResults: FileReviewResult[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Inject markers for all findings into the diff view. Safe to call repeatedly. */
export function applyAnnotations(fileResults: FileReviewResult[]): void {
  cachedFileResults = fileResults;

  try {
    applyMarkersToDOM();
    startObserver();
  } catch (err) {
    console.warn('[ADO Review] Inline annotations failed — panel still works.', err);
  }
}

/** Remove all injected markers, popover, and disconnect the observer. */
export function clearAnnotations(): void {
  stopObserver();
  removeAllMarkers();
  hidePopover();
  removePopoverHost();
  cachedFileResults = [];
}

// ---------------------------------------------------------------------------
// A. Diff file section discovery
// ---------------------------------------------------------------------------

/**
 * Build a map from normalized file path → header element in the diff view.
 * Azure DevOps diff headers contain the file path in various places depending
 * on the version of the UI.
 */
function getDiffFileSections(): Map<string, Element> {
  const headers = querySelectorAllFallback(SELECTORS.DIFF_FILE_HEADERS);
  const map = new Map<string, Element>();

  for (const header of headers) {
    const path = extractPathFromHeader(header);
    if (path) {
      map.set(normalizePath(path), header);
    }
  }

  return map;
}

function extractPathFromHeader(header: Element): string | null {
  // Try data-path attribute first (most reliable)
  const dataPath = header.getAttribute('data-path');
  if (dataPath) return dataPath;

  // Try title attribute
  const title = header.getAttribute('title');
  if (title && title.includes('/')) return title;

  // Try text content of path-like child elements
  const pathEl =
    header.querySelector('[data-path]') ??
    header.querySelector('.file-path') ??
    header.querySelector('.repos-summary-file-name') ??
    header.querySelector('.file-name');

  if (pathEl) {
    const p = pathEl.getAttribute('data-path') ?? pathEl.getAttribute('title') ?? pathEl.textContent;
    if (p && p.includes('/')) return p.trim();
  }

  // Fallback: header's own text if it looks like a path
  const text = header.textContent?.trim() ?? '';
  if (text.includes('/') && !text.includes(' ')) return text;

  return null;
}

function normalizePath(p: string): string {
  return p.replace(/^\/?/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// B. Line element lookup
// ---------------------------------------------------------------------------

/**
 * Within a file's diff section, find the DOM element for a specific line number.
 * Tries several strategies since Azure DevOps diff DOM varies.
 */
function findLineElement(section: Element, lineNumber: number): Element | null {
  // Strategy: find the scrollable diff content area relative to the header
  const container = findDiffContainer(section);
  if (!container) return null;

  // Strategy 1: elements with line-number class or data-line attribute
  const candidates = container.querySelectorAll('.line-number, [data-line]');
  for (const el of candidates) {
    const num = el.getAttribute('data-line') ?? el.textContent?.trim();
    if (num === String(lineNumber)) return el;
  }

  // Strategy 2: walk role="row" elements and check for line number text
  const rows = container.querySelectorAll('[role="row"], tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('[role="gridcell"], td, .line-number-cell');
    for (const cell of cells) {
      if (cell.textContent?.trim() === String(lineNumber)) return cell;
    }
  }

  return null;
}

/**
 * Given a file header element, find its associated diff content container.
 * Walks up/sideways in the DOM to find the code area.
 */
function findDiffContainer(header: Element): Element | null {
  // Check siblings
  let sibling = header.nextElementSibling;
  for (let i = 0; i < 5 && sibling; i++) {
    if (isDiffContent(sibling)) return sibling;
    sibling = sibling.nextElementSibling;
  }

  // Check parent's children
  const parent = header.parentElement;
  if (parent) {
    for (const child of parent.children) {
      if (child !== header && isDiffContent(child)) return child;
    }
  }

  // Check parent's next sibling
  const parentSibling = parent?.nextElementSibling;
  if (parentSibling && isDiffContent(parentSibling)) return parentSibling;

  return parent;
}

function isDiffContent(el: Element): boolean {
  return (
    el.querySelector('[role="grid"]') !== null ||
    el.querySelector('table') !== null ||
    el.classList.contains('repos-diff-contents') ||
    el.classList.contains('code-diff-container')
  );
}

// ---------------------------------------------------------------------------
// C. Marker injection
// ---------------------------------------------------------------------------

function applyMarkersToDOM(): void {
  const sections = getDiffFileSections();
  if (sections.size === 0) {
    console.warn('[ADO Review] No diff file sections found — inline annotations skipped.');
    return;
  }

  for (const fileResult of cachedFileResults) {
    if (fileResult.status !== 'success' || !fileResult.findings?.length) continue;

    const normalizedPath = normalizePath(fileResult.filePath);
    const header = sections.get(normalizedPath);
    if (!header) continue;

    // Group findings by line
    const byLine = new Map<number, Finding[]>();
    for (const f of fileResult.findings) {
      const existing = byLine.get(f.line) ?? [];
      existing.push(f);
      byLine.set(f.line, existing);
    }

    for (const [line, findings] of byLine) {
      try {
        const lineEl = findLineElement(header, line);
        if (!lineEl) continue;

        // Skip if already marked
        if (lineEl.querySelector(`[${MARKER_ATTR}]`)) continue;

        injectMarker(lineEl, findings, fileResult.filePath);
      } catch {
        // Skip this line silently
      }
    }
  }
}

function injectMarker(lineEl: Element, findings: Finding[], filePath: string): void {
  const highestSeverity = getHighestSeverity(findings);
  const color = SEVERITY_COLORS[highestSeverity] ?? SEVERITY_COLORS.Info;

  const dot = document.createElement('span');
  dot.setAttribute(MARKER_ATTR, 'true');
  dot.style.cssText = `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${color};
    margin-left: 4px;
    cursor: pointer;
    vertical-align: middle;
    flex-shrink: 0;
  `;
  dot.title = `${findings.length} finding${findings.length !== 1 ? 's' : ''} (${highestSeverity})`;

  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    showPopover(dot, findings, filePath);
  });

  lineEl.appendChild(dot);
}

function getHighestSeverity(findings: Finding[]): string {
  const order = ['Critical', 'Warning', 'Info'];
  for (const sev of order) {
    if (findings.some((f) => f.severity === sev)) return sev;
  }
  return 'Info';
}

// ---------------------------------------------------------------------------
// D. Popover (Shadow DOM isolated)
// ---------------------------------------------------------------------------

function getPopoverHost(): HTMLElement {
  let host = document.getElementById(POPOVER_HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = POPOVER_HOST_ID;
    host.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 99999;';
    document.body.appendChild(host);
  }
  return host;
}

function removePopoverHost(): void {
  document.getElementById(POPOVER_HOST_ID)?.remove();
}

function showPopover(anchor: Element, findings: Finding[], filePath: string): void {
  hidePopover();

  const host = getPopoverHost();
  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: 'open' });
  }

  const rect = anchor.getBoundingClientRect();

  shadow.innerHTML = `
    <style>${popoverStyles()}</style>
    <div class="ado-popover" style="top: ${rect.bottom + window.scrollY + 4}px; left: ${rect.left + window.scrollX}px;">
      <div class="ado-popover-header">
        <span class="ado-popover-path">${escapeHtml(truncatePath(filePath))}</span>
        <button class="ado-popover-close" type="button">&times;</button>
      </div>
      <div class="ado-popover-body">
        ${findings.map((f) => renderPopoverFinding(f)).join('')}
      </div>
    </div>
  `;

  // Close handlers
  const closeBtn = shadow.querySelector('.ado-popover-close');
  closeBtn?.addEventListener('click', hidePopover);

  const onClickOutside = (e: MouseEvent) => {
    if (!shadow?.querySelector('.ado-popover')?.contains(e.target as Node) && e.target !== anchor) {
      hidePopover();
      document.removeEventListener('click', onClickOutside, true);
    }
  };

  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hidePopover();
      document.removeEventListener('keydown', onEscape);
    }
  };

  // Delay to avoid immediate close from the same click
  setTimeout(() => {
    document.addEventListener('click', onClickOutside, true);
    document.addEventListener('keydown', onEscape);
  }, 0);

  // Wire up copy fix buttons (now copies suggestedCode)
  const copyBtns = shadow.querySelectorAll('[data-copy-suggestion]');
  for (const btn of copyBtns) {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-copy-suggestion') ?? '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
      } catch {
        btn.textContent = 'Failed';
      }
      setTimeout(() => (btn.textContent = 'Copy Fix'), 2000);
    });
  }
}

function hidePopover(): void {
  const host = document.getElementById(POPOVER_HOST_ID);
  if (host?.shadowRoot) {
    host.shadowRoot.innerHTML = '';
  }
}

function renderPopoverFinding(f: Finding): string {
  const sevColor = SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.Info;
  const suggestionHtml = f.suggestion
    ? `<div class="ado-popover-suggestion-text">${escapeHtml(f.suggestion)}</div>`
    : '';
  const codeHtml = f.suggestedCode
    ? `<div class="ado-popover-code-suggestion">
         <pre class="ado-popover-code-block"><code>${escapeHtml(f.suggestedCode)}</code></pre>
         <button class="ado-popover-copy-btn" data-copy-suggestion="${escapeAttr(f.suggestedCode)}" type="button">Copy Fix</button>
       </div>`
    : '';
  const whyHtml = f.why
    ? `<div class="ado-popover-why"><strong>Why:</strong> ${escapeHtml(f.why)}</div>`
    : '';

  return `
    <div class="ado-popover-finding">
      <div class="ado-popover-finding-header">
        <span class="ado-popover-line">L${f.line}</span>
        <span class="ado-popover-badge" style="background: ${sevColor}20; color: ${sevColor};">${escapeHtml(f.severity)}</span>
      </div>
      <div class="ado-popover-message">${escapeHtml(f.message)}</div>
      ${suggestionHtml}
      ${codeHtml}
      ${whyHtml}
    </div>
  `;
}

function popoverStyles(): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    .ado-popover {
      position: absolute;
      width: 380px;
      max-height: 400px;
      display: flex;
      flex-direction: column;
      background: #fff;
      border: 1px solid #e1dfdd;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.16);
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px;
      color: #323130;
      overflow: hidden;
    }
    .ado-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid #edebe9;
      flex-shrink: 0;
    }
    .ado-popover-path {
      font-weight: 600;
      font-size: 11px;
      color: #605e5c;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ado-popover-close {
      background: none;
      border: none;
      font-size: 16px;
      color: #605e5c;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1;
    }
    .ado-popover-close:hover {
      background: #f3f2f1;
      color: #323130;
    }
    .ado-popover-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ado-popover-finding-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .ado-popover-line {
      font-family: "Cascadia Code", "Fira Code", monospace;
      font-size: 11px;
      color: #605e5c;
    }
    .ado-popover-badge {
      display: inline-flex;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }
    .ado-popover-message {
      line-height: 1.5;
      margin-bottom: 4px;
    }
    .ado-popover-suggestion-text {
      font-size: 11px;
      color: #605e5c;
      line-height: 1.5;
      margin-bottom: 4px;
    }
    .ado-popover-code-suggestion {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 4px;
    }
    .ado-popover-code-block {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 6px 10px;
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 4px;
      font-family: "Cascadia Code", "Fira Code", monospace;
      font-size: 11px;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre;
    }
    .ado-popover-code-block code {
      font-family: inherit;
      font-size: inherit;
    }
    .ado-popover-copy-btn {
      flex-shrink: 0;
      padding: 2px 8px;
      border: 1px solid #8a8886;
      border-radius: 3px;
      background: #fff;
      color: #605e5c;
      font-family: inherit;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .ado-popover-copy-btn:hover {
      background: #f3f2f1;
      color: #323130;
    }
    .ado-popover-why {
      font-size: 11px;
      color: #605e5c;
      padding: 4px 8px;
      background: #f3f2f1;
      border-radius: 3px;
      line-height: 1.4;
    }
  `;
}

function truncatePath(path: string): string {
  if (path.length <= 50) return path;
  const segments = path.split('/');
  if (segments.length <= 2) return path;
  return `\u2026/${segments.slice(-2).join('/')}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// E. MutationObserver — re-apply markers when diff view re-renders
// ---------------------------------------------------------------------------

function startObserver(): void {
  if (observer) return;

  // Find a reasonable root to observe
  const containers = querySelectorAllFallback(SELECTORS.DIFF_CONTENT_CONTAINER);
  const target = containers[0] ?? document.body;

  observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        applyMarkersToDOM();
      } catch (err) {
        console.warn('[ADO Review] Observer re-apply failed:', err);
      }
    }, 200);
  });

  observer.observe(target, { childList: true, subtree: true });
}

function stopObserver(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// ---------------------------------------------------------------------------
// F. Cleanup
// ---------------------------------------------------------------------------

function removeAllMarkers(): void {
  const markers = document.querySelectorAll(`[${MARKER_ATTR}]`);
  for (const m of markers) {
    m.remove();
  }
}
