/**
 * Floating popover panel for PEP Review results.
 *
 * Shows progress during review, rich results on completion (severity badges,
 * collapsible file sections with individual findings), and action buttons
 * for export, copy, and review-again.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';

interface ReviewPanelProps {
  phase: 'reviewing' | 'complete' | 'error';
  progress: ReviewProgress | null;
  fileResults: FileReviewResult[];
  summary: ReviewSummary | null;
  errorMessage: string | null;
  onExport: () => void;
  onCopy: () => void;
  onReviewAgain: () => void;
  onClose: () => void;
  copyLabel: string;
}

function truncatePath(path: string): string {
  if (path.length <= 45) return path;
  const segments = path.split('/');
  if (segments.length <= 2) return path;
  return `\u2026/${segments.slice(-2).join('/')}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function SeverityBadge({ severity, count }: { severity: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className={`pep-badge pep-badge--${severity.toLowerCase()}`}>
      {count} {severity}
    </span>
  );
}

function FileSection({ result }: { result: FileReviewResult }) {
  const [expanded, setExpanded] = useState(false);
  const findings = result.findings ?? [];
  const hasFindingsDetail = result.status === 'success' && findings.length > 0;

  return (
    <div className="pep-file-section">
      <button
        className="pep-file-section-header"
        onClick={() => hasFindingsDetail && setExpanded(!expanded)}
        type="button"
      >
        <span className={`pep-file-section-icon pep-file-section-icon--${result.status}`}>
          {result.status === 'success' && '\u2713'}
          {result.status === 'error' && '\u2717'}
          {result.status === 'skipped' && '\u2013'}
        </span>
        <span className="pep-file-section-name" title={result.filePath}>
          {truncatePath(result.filePath)}
        </span>
        <span className="pep-file-section-count">
          {result.status === 'success' && `${result.findingCount ?? 0}`}
          {result.status === 'error' && 'Error'}
          {result.status === 'skipped' && 'Skip'}
        </span>
        {hasFindingsDetail && (
          <span className={`pep-file-section-chevron${expanded ? ' pep-file-section-chevron--open' : ''}`}>
            {'\u25B6'}
          </span>
        )}
      </button>

      {expanded && findings.length > 0 && (
        <div className="pep-file-section-body">
          {findings.map((f, i) => (
            <div key={i} className="pep-finding">
              <div className="pep-finding-header">
                <span className="pep-finding-line">L{f.line}</span>
                <span className={`pep-badge pep-badge--${f.severity.toLowerCase()}`}>
                  {f.severity}
                </span>
              </div>
              <div className="pep-finding-message">{f.message}</div>
              {f.suggestion && (
                <div className="pep-finding-suggestion">{f.suggestion}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewPanel({
  phase,
  progress,
  fileResults,
  summary,
  errorMessage,
  onExport,
  onCopy,
  onReviewAgain,
  onClose,
  copyLabel,
}: ReviewPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="pep-panel">
      {/* Header */}
      <div className="pep-panel-header">
        <span className="pep-panel-title">PEP Review</span>
        <button className="pep-panel-close" onClick={onClose} type="button">
          {'\u2715'}
        </button>
      </div>

      {/* Body */}
      <div className="pep-panel-body">
        {/* Reviewing state */}
        {phase === 'reviewing' && progress && (
          <>
            <div className="pep-progress-status">
              {progress.status === 'posting-comments'
                ? `Posting comments\u2026`
                : progress.fileIndex === 0
                  ? 'Preparing review\u2026'
                  : `Reviewing file ${progress.fileIndex} of ${progress.totalFiles}`}
            </div>
            <div className="pep-progress-bar">
              <div
                className="pep-progress-fill"
                style={{
                  width: `${progress.totalFiles > 0 ? (progress.fileIndex / progress.totalFiles) * 100 : 0}%`,
                }}
              />
            </div>
            {progress.currentFile && (
              <div className="pep-progress-file">{truncatePath(progress.currentFile)}</div>
            )}
            {fileResults.length > 0 && (
              <div className="pep-panel-files">
                {fileResults.map((r, i) => (
                  <FileSection key={i} result={r} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Complete state */}
        {phase === 'complete' && summary && (
          <>
            <div className="pep-summary-stats">
              <div className="pep-summary-line">
                {summary.reviewedFiles} files reviewed
                {summary.skippedFiles > 0 && `, ${summary.skippedFiles} skipped`}
                {summary.errorFiles > 0 && `, ${summary.errorFiles} errors`}
                {' \u2014 '}
                {formatDuration(summary.durationMs)}
              </div>
              <div className="pep-summary-badges">
                <SeverityBadge severity="Critical" count={summary.findingsBySeverity.Critical} />
                <SeverityBadge severity="Warning" count={summary.findingsBySeverity.Warning} />
                <SeverityBadge severity="Info" count={summary.findingsBySeverity.Info} />
                {summary.totalFindings === 0 && (
                  <span className="pep-badge pep-badge--clean">No findings</span>
                )}
              </div>
            </div>

            {fileResults.length > 0 && (
              <div className="pep-panel-files">
                {fileResults.map((r, i) => (
                  <FileSection key={i} result={r} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="pep-panel-error">{errorMessage ?? 'An unknown error occurred.'}</div>
        )}
      </div>

      {/* Actions */}
      <div className="pep-panel-actions">
        {phase === 'complete' && (
          <>
            <button className="pep-action-btn pep-action-btn--primary" onClick={onExport} type="button">
              Export Markdown
            </button>
            <button className="pep-action-btn" onClick={onCopy} type="button">
              {copyLabel}
            </button>
          </>
        )}
        {(phase === 'complete' || phase === 'error') && (
          <button className="pep-action-btn" onClick={onReviewAgain} type="button">
            Review Again
          </button>
        )}
      </div>
    </div>
  );
}
