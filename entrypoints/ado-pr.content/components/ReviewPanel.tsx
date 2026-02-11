/**
 * Floating popover panel for PEP Review.
 *
 * Shows real-time progress during review, rich results on completion
 * (severity badges, collapsible file sections with individual findings),
 * and action buttons for posting, exporting, copying, and re-reviewing.
 *
 * Supports stop (keeps partial results) and discard (reset to idle).
 */

import { useState, useEffect, useCallback } from 'react';
import type { ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';

interface ReviewPanelProps {
  phase: 'reviewing' | 'complete' | 'error';
  progress: ReviewProgress | null;
  fileResults: FileReviewResult[];
  summary: ReviewSummary | null;
  errorMessage: string | null;
  isPartial: boolean;
  onExport: () => void;
  onCopy: () => void;
  onPostToPr: () => void;
  onReviewAgain: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onClose: () => void;
  copyLabel: string;
  postLabel: string;
}

function truncatePath(path: string): string {
  if (path.length <= 50) return path;
  const segments = path.split('/');
  if (segments.length <= 2) return path;
  return `\u2026/${segments.slice(-2).join('/')}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '';
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
              {f.why && (
                <div className="pep-finding-why">
                  <strong>Why:</strong> {f.why}
                </div>
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
  isPartial,
  onExport,
  onCopy,
  onPostToPr,
  onReviewAgain,
  onStop,
  onDiscard,
  onClose,
  copyLabel,
  postLabel,
}: ReviewPanelProps) {
  // Escape: stop if reviewing, close if complete/error
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'reviewing') {
          onStop();
        } else {
          onClose();
        }
      }
    },
    [phase, onStop, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const percentage = progress && progress.totalFiles > 0
    ? Math.round((progress.fileIndex / progress.totalFiles) * 100)
    : 0;

  const canPost = phase === 'complete' && !isPartial && postLabel !== 'Posted!';

  // Header subtitle based on phase
  let headerSubtitle = '';
  if (phase === 'reviewing' && progress) {
    headerSubtitle = progress.fileIndex === 0
      ? 'Preparing\u2026'
      : `${progress.fileIndex}/${progress.totalFiles} files \u2022 ${percentage}%`;
  } else if (phase === 'complete' && summary) {
    headerSubtitle = `${summary.totalFindings} finding${summary.totalFindings !== 1 ? 's' : ''}`;
    if (isPartial) headerSubtitle += ' (partial)';
  } else if (phase === 'error') {
    headerSubtitle = 'Error';
  }

  return (
    <div className="pep-panel">
      {/* Header */}
      <div className="pep-panel-header">
        <div className="pep-panel-header-left">
          <span className="pep-panel-title">PEP Review</span>
          {headerSubtitle && (
            <span className="pep-panel-subtitle">{headerSubtitle}</span>
          )}
        </div>
        <button className="pep-panel-close" onClick={phase === 'reviewing' ? onStop : onClose} type="button" title={phase === 'reviewing' ? 'Stop review (Esc)' : 'Close (Esc)'}>
          {'\u2715'}
        </button>
      </div>

      {/* Body */}
      <div className="pep-panel-body">
        {/* Reviewing state */}
        {phase === 'reviewing' && progress && (
          <>
            <div className="pep-progress-header">
              <span className="pep-progress-status">
                {progress.fileIndex === 0
                  ? 'Preparing review\u2026'
                  : `Reviewing file ${progress.fileIndex} of ${progress.totalFiles}`}
              </span>
              <span className="pep-progress-pct">{percentage}%</span>
            </div>
            <div className="pep-progress-bar">
              <div
                className="pep-progress-fill"
                style={{ width: `${percentage}%` }}
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
            {isPartial && (
              <div className="pep-panel-notice">
                Review was stopped early. Showing partial results. Run a full review to post to PR.
              </div>
            )}

            <div className="pep-summary-stats">
              <div className="pep-summary-line">
                {summary.reviewedFiles} of {summary.totalFiles} files reviewed
                {summary.skippedFiles > 0 && ` \u2022 ${summary.skippedFiles} skipped`}
                {summary.errorFiles > 0 && ` \u2022 ${summary.errorFiles} errors`}
                {summary.durationMs > 0 && ` \u2014 ${formatDuration(summary.durationMs)}`}
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
      <div className="pep-panel-footer">
        {/* During review: Stop button */}
        {phase === 'reviewing' && (
          <div className="pep-panel-actions">
            <button className="pep-action-btn pep-action-btn--danger" onClick={onStop} type="button">
              Stop Review
            </button>
          </div>
        )}

        {/* Complete: primary + secondary actions */}
        {phase === 'complete' && (
          <>
            <div className="pep-panel-actions">
              <button
                className={`pep-action-btn pep-action-btn--primary${!canPost ? ' pep-action-btn--disabled' : ''}`}
                onClick={onPostToPr}
                disabled={!canPost}
                type="button"
                title={isPartial ? 'Run a full review to post' : ''}
              >
                {postLabel}
              </button>
              <button className="pep-action-btn" onClick={onExport} type="button">
                Export
              </button>
              <button className="pep-action-btn" onClick={onCopy} type="button">
                {copyLabel}
              </button>
            </div>
            <div className="pep-panel-actions pep-panel-actions--secondary">
              <button className="pep-action-btn pep-action-btn--text" onClick={onReviewAgain} type="button">
                Review Again
              </button>
              <button className="pep-action-btn pep-action-btn--text" onClick={onDiscard} type="button">
                Discard
              </button>
            </div>
          </>
        )}

        {/* Error: retry + discard */}
        {phase === 'error' && (
          <div className="pep-panel-actions">
            <button className="pep-action-btn pep-action-btn--primary" onClick={onReviewAgain} type="button">
              Retry
            </button>
            <button className="pep-action-btn" onClick={onDiscard} type="button">
              Discard
            </button>
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="pep-panel-branding">
        Developed by{' '}
        <a href="https://www.linkedin.com/in/rajeshkumarsheela/" target="_blank" rel="noopener noreferrer">
          @sheelarajeshkumar
        </a>
      </div>
    </div>
  );
}
