/**
 * File-by-file review progress indicator.
 *
 * Shows current file being reviewed, a progress bar, and a scrollable
 * list of completed file results with status indicators.
 */

import type { ReviewProgress, FileReviewResult } from '@/shared/types';

interface ReviewProgressProps {
  progress: ReviewProgress;
  fileResults: FileReviewResult[];
}

/**
 * Truncate a file path to show only the last two segments if too long.
 */
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
  if (status === 'posting-comments') {
    statusText = `Posting comments for ${truncateFileName(currentFile)}...`;
  } else if (fileIndex === 0) {
    statusText = 'Preparing review...';
  } else {
    statusText = `Reviewing file ${fileIndex} of ${totalFiles}`;
  }

  return (
    <div className="pep-progress">
      <div className="pep-progress-status">{statusText}</div>
      <div className="pep-progress-bar">
        <div className="pep-progress-fill" style={{ width: `${percentage}%` }} />
      </div>
      {currentFile && (
        <div className="pep-progress-file">{truncateFileName(currentFile)}</div>
      )}

      {fileResults.length > 0 && (
        <div className="pep-file-results">
          {fileResults.map((result, i) => (
            <div key={i} className="pep-file-result">
              <span
                className={`pep-file-result-icon pep-file-result-icon--${result.status}`}
              >
                {result.status === 'success' && '\u2713'}
                {result.status === 'error' && '\u2717'}
                {result.status === 'skipped' && '\u2013'}
              </span>
              <span className="pep-file-result-name" title={result.filePath}>
                {truncateFileName(result.filePath)}
              </span>
              <span className="pep-file-result-count">
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
