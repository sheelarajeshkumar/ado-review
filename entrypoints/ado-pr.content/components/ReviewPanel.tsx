import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';
import { cn } from '@/lib/cn';
import { ThemeToggle } from '@/lib/ThemeToggle';

function CopyFixButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy Fix');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel('Copied!');
    } catch {
      setLabel('Failed');
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLabel('Copy Fix'), 2000);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <button
      className="shrink-0 px-2 py-0.5 border border-fluent-border rounded text-fluent-text-secondary
        bg-fluent-bg text-[10px] font-semibold cursor-pointer whitespace-nowrap leading-relaxed
        hover:bg-fluent-bg-hover hover:text-fluent-text transition-colors duration-150"
      onClick={handleClick}
      type="button"
    >
      {label}
    </button>
  );
}

interface ReviewPanelProps {
  phase: 'reviewing' | 'complete' | 'error';
  progress: ReviewProgress | null;
  fileResults: FileReviewResult[];
  summary: ReviewSummary | null;
  errorMessage: string | null;
  isPartial: boolean;
  panelStyle?: React.CSSProperties;
  animationClass?: string;
  isDark: boolean;
  onToggleTheme: () => void;
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
  return `.../${segments.slice(-2).join('/')}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-severity-critical-bg text-severity-critical-text border-l-2 border-l-severity-critical-border',
  warning: 'bg-severity-warning-bg text-severity-warning-text border-l-2 border-l-severity-warning-border',
  info: 'bg-severity-info-bg text-severity-info-text border-l-2 border-l-severity-info-border',
  clean: 'bg-severity-clean-bg text-severity-clean-text border-l-2 border-l-severity-clean-border',
};

function FileSection({ result, index }: { result: FileReviewResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const findings = result.findings ?? [];
  const hasFindingsDetail = result.status === 'success' && findings.length > 0;

  return (
    <div
      className="border border-fluent-border-subtle rounded-md overflow-hidden animate-fade-in"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
    >
      <button
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 bg-fluent-bg-subtle border-none',
          'font-sans text-xs text-fluent-text text-left transition-colors duration-100',
          hasFindingsDetail && 'cursor-pointer hover:bg-fluent-bg-hover',
          !hasFindingsDetail && 'cursor-default',
        )}
        onClick={() => hasFindingsDetail && setExpanded(!expanded)}
        type="button"
      >
        {/* Status icon */}
        <span className={cn('shrink-0 w-4 text-center flex items-center justify-center')}>
          {result.status === 'success' && (
            <svg className="w-3 h-3 text-severity-clean-text" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 8 7 12 13 4" />
            </svg>
          )}
          {result.status === 'error' && (
            <svg className="w-3 h-3 text-severity-critical-border" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          )}
          {result.status === 'skipped' && (
            <svg className="w-3 h-3 text-fluent-text-disabled" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="8" x2="12" y2="8" />
            </svg>
          )}
        </span>

        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={result.filePath}>
          {truncatePath(result.filePath)}
        </span>
        {result.status === 'success' && (
          <span className={cn(
            'shrink-0 text-[10px] font-semibold px-1.5 py-px rounded-full',
            (result.findingCount ?? 0) > 0
              ? 'bg-fluent-primary-soft text-fluent-primary'
              : 'text-fluent-text-disabled',
          )}>
            {result.findingCount ?? 0}
          </span>
        )}
        {result.status === 'error' && (
          <span className="shrink-0 text-[10px] font-semibold text-severity-critical-text">Error</span>
        )}
        {result.status === 'skipped' && (
          <span className="shrink-0 text-[10px] text-fluent-text-disabled">Skip</span>
        )}
        {hasFindingsDetail && (
          <svg
            className={cn(
              'shrink-0 w-2.5 h-2.5 text-fluent-text-secondary transition-transform duration-150',
              expanded && 'rotate-90',
            )}
            viewBox="0 0 8 12"
            fill="currentColor"
          >
            <path d="M1.5 0L7.5 6L1.5 12z" />
          </svg>
        )}
      </button>

      {/* Accordion body */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {findings.length > 0 && (
            <div className="border-t border-fluent-border-subtle px-3 py-2.5 flex flex-col gap-2">
              {findings.map((f, i) => (
                <div
                  key={i}
                  className="text-xs text-fluent-text rounded-md border border-fluent-border-subtle p-3
                    hover:border-fluent-border transition-colors duration-150
                    animate-fade-in bg-fluent-bg"
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-[11px] text-fluent-text-secondary bg-fluent-bg-subtle px-1.5 py-px rounded">
                      L{f.line}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-semibold leading-relaxed',
                        SEVERITY_STYLES[f.severity.toLowerCase()],
                      )}
                    >
                      {f.severity}
                    </span>
                  </div>
                  <div className="leading-normal text-fluent-text">{f.message}</div>
                  {f.suggestion && (
                    <div className="mt-2 px-2.5 py-2 bg-fluent-bg-subtle rounded-md text-[11px] text-fluent-text-secondary leading-normal border border-fluent-border-subtle">
                      {f.suggestion}
                    </div>
                  )}
                  {f.suggestedCode && (
                    <div className="flex items-start gap-2 mt-2">
                      <pre className="flex-1 min-w-0 m-0 px-3 py-2 bg-code-bg text-code-text rounded-md
                        font-mono text-[11px] leading-normal overflow-x-auto whitespace-pre">
                        <code>{f.suggestedCode}</code>
                      </pre>
                      <CopyFixButton text={f.suggestedCode} />
                    </div>
                  )}
                  {f.why && (
                    <div className="text-[11px] text-fluent-text-secondary mt-2 px-2.5 py-2 bg-fluent-bg-subtle rounded-md leading-relaxed border border-fluent-border-subtle">
                      <strong>Why:</strong> {f.why}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Mini Donut --- */
function MiniDonut({ critical, warning, info, total }: { critical: number; warning: number; info: number; total: number }) {
  const size = 56;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { value: critical, color: 'var(--color-severity-critical-border)' },
    { value: warning, color: 'var(--color-severity-warning-border)' },
    { value: info, color: 'var(--color-severity-info-border)' },
  ];

  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dashLen = fraction * circumference;
    const gap = circumference - dashLen;
    const offset = -(accumulated * circumference) + circumference / 4;
    accumulated += fraction;
    return { ...seg, dashLen, gap, offset };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="var(--color-fluent-border-subtle)" strokeWidth={strokeWidth} />
        {total > 0 && arcs.map((arc, i) =>
          arc.value > 0 ? (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={arc.color} strokeWidth={strokeWidth}
              strokeDasharray={`${arc.dashLen} ${arc.gap}`}
              strokeDashoffset={arc.offset} strokeLinecap="round"
              className="transition-all duration-500" />
          ) : null,
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold leading-none text-fluent-text">{total}</span>
      </div>
    </div>
  );
}

/* --- Severity Bar --- */
function SeverityBar({ label, count, total, barColor, textColor, bgColor }: {
  label: string; count: number; total: number;
  barColor: string; textColor: string; bgColor: string;
}) {
  const pct = total > 0 ? Math.max(3, (count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-[50px] text-[10px] font-medium shrink-0', textColor)}>{label}</span>
      <div className={cn('flex-1 h-1.5 rounded-full overflow-hidden', bgColor)}>
        {count > 0 && (
          <div className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${pct}%` }} />
        )}
      </div>
      <span className={cn('w-5 text-right text-[10px] font-semibold tabular-nums', textColor)}>{count}</span>
    </div>
  );
}

/* --- Action button helpers --- */
const btnBase = 'px-3.5 py-1.5 rounded-md font-sans text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150';
const btnPrimary = cn(btnBase, 'bg-fluent-primary border border-fluent-primary text-white hover:bg-fluent-primary-hover hover:border-fluent-primary-hover');
const btnSecondary = cn(btnBase, 'border border-fluent-border bg-fluent-bg text-fluent-text hover:bg-fluent-bg-hover');
const btnDanger = cn(btnBase, 'border border-severity-critical-border bg-fluent-bg text-severity-critical-border hover:bg-severity-critical-bg');
const btnDisabled = cn(btnBase, 'bg-fluent-disabled-bg border border-fluent-disabled-bg text-fluent-disabled-text cursor-not-allowed');
const btnText = 'bg-transparent border-none text-fluent-text-secondary font-sans text-xs px-2 py-1 cursor-pointer hover:text-fluent-primary transition-colors duration-150';

export default function ReviewPanel({
  phase,
  progress,
  fileResults,
  summary,
  errorMessage,
  isPartial,
  panelStyle,
  animationClass,
  isDark,
  onToggleTheme,
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

  let headerSubtitle = '';
  if (phase === 'reviewing' && progress) {
    headerSubtitle = progress.fileIndex === 0
      ? 'Preparing...'
      : `${progress.fileIndex}/${progress.totalFiles} files`;
  } else if (phase === 'complete' && summary) {
    headerSubtitle = `${summary.totalFindings} finding${summary.totalFindings !== 1 ? 's' : ''}`;
    if (isPartial) headerSubtitle += ' (partial)';
  } else if (phase === 'error') {
    headerSubtitle = 'Error';
  }

  return (
    <div
      className={cn(
        'fixed w-[520px] max-h-[600px] flex flex-col',
        'bg-fluent-bg border border-fluent-border rounded-xl',
        'shadow-[0_8px_30px_rgba(0,0,0,0.12)] z-[10000] overflow-hidden',
        animationClass,
      )}
      style={panelStyle}
    >
      {/* Arrow caret */}
      <div className="absolute -top-1.5 right-4 w-3 h-3 bg-fluent-bg border-t border-l border-fluent-border rotate-45" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-fluent-border-subtle shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[15px] font-bold text-fluent-text shrink-0">ADO Review</span>
          {headerSubtitle && (
            <span className="text-[11px] font-medium text-fluent-text-secondary whitespace-nowrap overflow-hidden text-ellipsis
              bg-fluent-bg-subtle px-2 py-0.5 rounded-full">
              {headerSubtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} size="sm" />
          <button
            className="bg-transparent border-none text-fluent-text-secondary cursor-pointer
              w-7 h-7 flex items-center justify-center rounded-full
              hover:bg-fluent-bg-hover hover:text-fluent-text transition-colors duration-150"
            onClick={phase === 'reviewing' ? onStop : onClose}
            type="button"
            title={phase === 'reviewing' ? 'Stop review (Esc)' : 'Close (Esc)'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Reviewing state */}
        {phase === 'reviewing' && progress && (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[13px] font-semibold text-fluent-text">
                {progress.fileIndex === 0
                  ? 'Preparing review...'
                  : `Reviewing file ${progress.fileIndex} of ${progress.totalFiles}`}
              </span>
              <span className="text-xs font-bold text-fluent-primary tabular-nums">{percentage}%</span>
            </div>
            <div className="h-1.5 bg-fluent-border-subtle rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out
                  bg-[linear-gradient(90deg,var(--color-fluent-primary),#47a3f3,var(--color-fluent-primary))]
                  bg-[length:200%_100%] animate-shimmer"
                style={{ width: `${percentage}%` }}
              />
            </div>
            {progress.currentFile && (
              <div className="text-fluent-text-secondary text-[11px] overflow-hidden text-ellipsis whitespace-nowrap mb-3">
                {truncatePath(progress.currentFile)}
              </div>
            )}

            {fileResults.length > 0 && (
              <div className="flex flex-col gap-1">
                {fileResults.map((r, i) => (
                  <FileSection key={i} result={r} index={i} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Complete state — metrics + file list */}
        {phase === 'complete' && summary && (
          <>
            {isPartial && (
              <div className="px-3 py-2.5 mb-3 bg-severity-warning-bg border border-severity-warning-border rounded-md text-xs text-severity-warning-text leading-relaxed">
                Review was stopped early. Showing partial results. Run a full review to post to PR.
              </div>
            )}

            {/* Metrics card */}
            <div className="mb-4 rounded-lg border border-fluent-border-subtle bg-fluent-bg-subtle p-3">
              <div className="flex items-center gap-4">
                {/* Donut */}
                <MiniDonut
                  critical={summary.findingsBySeverity.Critical}
                  warning={summary.findingsBySeverity.Warning}
                  info={summary.findingsBySeverity.Info}
                  total={summary.totalFindings}
                />

                {/* Right side: stats + bars */}
                <div className="flex-1 min-w-0">
                  {/* Stat row */}
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="text-center">
                      <div className="text-sm font-bold text-fluent-text leading-none">{summary.reviewedFiles}</div>
                      <div className="text-[9px] text-fluent-text-secondary mt-0.5">files</div>
                    </div>
                    <div className="w-px h-5 bg-fluent-border-subtle" />
                    <div className="text-center">
                      <div className="text-sm font-bold text-fluent-text leading-none">{summary.totalFindings}</div>
                      <div className="text-[9px] text-fluent-text-secondary mt-0.5">findings</div>
                    </div>
                    {summary.skippedFiles > 0 && (
                      <>
                        <div className="w-px h-5 bg-fluent-border-subtle" />
                        <div className="text-center">
                          <div className="text-sm font-bold text-fluent-text-secondary leading-none">{summary.skippedFiles}</div>
                          <div className="text-[9px] text-fluent-text-disabled mt-0.5">skipped</div>
                        </div>
                      </>
                    )}
                    {summary.durationMs > 0 && (
                      <>
                        <div className="w-px h-5 bg-fluent-border-subtle" />
                        <div className="text-center">
                          <div className="text-sm font-bold text-fluent-text-secondary leading-none">{formatDuration(summary.durationMs)}</div>
                          <div className="text-[9px] text-fluent-text-disabled mt-0.5">time</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Severity bars */}
                  <div className="space-y-1">
                    <SeverityBar label="Critical" count={summary.findingsBySeverity.Critical} total={summary.totalFindings}
                      barColor="bg-severity-critical-border" textColor="text-severity-critical-text" bgColor="bg-severity-critical-bg" />
                    <SeverityBar label="Warning" count={summary.findingsBySeverity.Warning} total={summary.totalFindings}
                      barColor="bg-severity-warning-border" textColor="text-severity-warning-text" bgColor="bg-severity-warning-bg" />
                    <SeverityBar label="Info" count={summary.findingsBySeverity.Info} total={summary.totalFindings}
                      barColor="bg-severity-info-border" textColor="text-severity-info-text" bgColor="bg-severity-info-bg" />
                  </div>
                </div>
              </div>

              {/* Clean result */}
              {summary.totalFindings === 0 && (
                <div className="mt-2.5 flex items-center gap-2 px-2.5 py-2 rounded-md bg-severity-clean-bg">
                  <svg className="w-4 h-4 text-severity-clean-text shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-xs font-semibold text-severity-clean-text">No findings - looking good!</span>
                </div>
              )}
            </div>

            {/* File list */}
            {fileResults.length > 0 && (
              <div className="flex flex-col gap-1">
                {fileResults.map((r, i) => (
                  <FileSection key={i} result={r} index={i} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="px-3 py-2.5 bg-severity-critical-bg border border-severity-critical-border rounded-md text-xs text-severity-critical-text leading-relaxed">
            {errorMessage ?? 'An unknown error occurred.'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-fluent-border-subtle shrink-0 px-4 py-2.5">
        {phase === 'reviewing' && (
          <div className="flex gap-2 items-center">
            <button className={btnDanger} onClick={onStop} type="button">Stop Review</button>
          </div>
        )}

        {phase === 'complete' && (
          <>
            <div className="flex gap-2 items-center">
              <button
                className={canPost ? btnPrimary : btnDisabled}
                onClick={onPostToPr}
                disabled={!canPost}
                type="button"
                title={isPartial ? 'Run a full review to post' : ''}
              >
                {postLabel}
              </button>
              <button className={btnSecondary} onClick={onExport} type="button">Export</button>
              <button className={btnSecondary} onClick={onCopy} type="button">{copyLabel}</button>
            </div>
            <div className="flex gap-1 items-center mt-2 pt-2 border-t border-fluent-border-subtle">
              <button className={btnText} onClick={onReviewAgain} type="button">Review Again</button>
              <span className="w-px h-3 bg-fluent-border" />
              <button className={btnText} onClick={onDiscard} type="button">Discard</button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <div className="flex gap-2 items-center">
            <button className={btnPrimary} onClick={onReviewAgain} type="button">Retry</button>
            <button className={btnSecondary} onClick={onDiscard} type="button">Discard</button>
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="px-4 py-2 border-t border-fluent-border-subtle text-[11px] text-fluent-text-disabled text-center">
        Developed by{' '}
        <a
          href="https://www.linkedin.com/in/rajeshkumarsheela/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-fluent-primary no-underline font-semibold hover:underline"
        >
          @sheelarajeshkumar
        </a>
      </div>
    </div>
  );
}
