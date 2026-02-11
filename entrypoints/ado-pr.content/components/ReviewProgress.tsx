import type { ReviewProgress, FileReviewResult } from '@/shared/types';
import { cn } from '@/lib/cn';

interface ReviewProgressProps {
  progress: ReviewProgress;
  fileResults: FileReviewResult[];
}

function truncateFileName(path: string): string {
  if (path.length <= 40) return path;
  const segments = path.split('/');
  if (segments.length <= 2) return path;
  return `.../${segments.slice(-2).join('/')}`;
}

export default function ReviewProgress({ progress, fileResults }: ReviewProgressProps) {
  const { currentFile, fileIndex, totalFiles, status } = progress;
  const percentage = totalFiles > 0 ? (fileIndex / totalFiles) * 100 : 0;

  let statusText: string;
  if (fileIndex === 0) {
    statusText = 'Preparing review...';
  } else {
    statusText = `Reviewing file ${fileIndex} of ${totalFiles}`;
  }

  return (
    <div>
      <div className="text-[13px] font-semibold text-fluent-text mb-2">{statusText}</div>
      <div className="h-1 bg-fluent-border-subtle rounded-sm overflow-hidden mb-1.5">
        <div
          className="h-full rounded-sm transition-[width] duration-300 ease-out
            bg-[linear-gradient(90deg,var(--color-fluent-primary),#47a3f3,var(--color-fluent-primary))]
            bg-[length:200%_100%] animate-shimmer"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {currentFile && (
        <div className="text-fluent-text-secondary text-[11px] overflow-hidden text-ellipsis whitespace-nowrap mb-2.5">
          {truncateFileName(currentFile)}
        </div>
      )}

      {fileResults.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {fileResults.map((result, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1 rounded text-xs animate-fade-in"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
            >
              <span
                className={cn(
                  'shrink-0 w-3.5 text-center text-xs',
                  result.status === 'success' && 'text-severity-clean-text',
                  result.status === 'error' && 'text-severity-critical-border',
                  result.status === 'skipped' && 'text-fluent-text-disabled',
                )}
              >
                {result.status === 'success' && '\u2713'}
                {result.status === 'error' && '\u2717'}
                {result.status === 'skipped' && '\u2013'}
              </span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-fluent-text" title={result.filePath}>
                {truncateFileName(result.filePath)}
              </span>
              <span className="shrink-0 text-fluent-text-secondary text-[11px]">
                {result.status === 'success' && `${result.findingCount ?? 0} findings`}
                {result.status === 'error' && (
                  <span title={result.error}>Error</span>
                )}
                {result.status === 'skipped' && 'Skipped'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
