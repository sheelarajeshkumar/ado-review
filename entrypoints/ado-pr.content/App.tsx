/**
 * Root React component for the PEP Review content script UI.
 *
 * Manages the review state machine (idle/reviewing/complete/error)
 * and renders the appropriate UI components for each state.
 */

import { useState } from 'react';
import type { PrInfo, ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';
import ReviewButton from './components/ReviewButton';
import ReviewProgressComponent from './components/ReviewProgress';

type ReviewState =
  | { phase: 'idle' }
  | { phase: 'reviewing'; progress: ReviewProgress; fileResults: FileReviewResult[] }
  | { phase: 'complete'; summary: ReviewSummary; fileResults: FileReviewResult[] }
  | { phase: 'error'; message: string };

interface AppProps {
  prInfo: PrInfo;
}

export default function App({ prInfo }: AppProps) {
  const [reviewState, setReviewState] = useState<ReviewState>({ phase: 'idle' });

  const handleStart = () => {
    setReviewState({
      phase: 'reviewing',
      progress: { currentFile: '', fileIndex: 0, totalFiles: 0, status: 'reviewing' },
      fileResults: [],
    });
  };

  const handleProgress = (progress: ReviewProgress) => {
    setReviewState((prev) => {
      if (prev.phase !== 'reviewing') return prev;
      return { ...prev, progress };
    });
  };

  const handleFileComplete = (result: FileReviewResult) => {
    setReviewState((prev) => {
      if (prev.phase !== 'reviewing') return prev;
      return { ...prev, fileResults: [...prev.fileResults, result] };
    });
  };

  const handleComplete = (summary: ReviewSummary) => {
    setReviewState((prev) => {
      const fileResults = prev.phase === 'reviewing' ? prev.fileResults : [];
      return { phase: 'complete', summary, fileResults };
    });
  };

  const handleError = (message: string) => {
    setReviewState({ phase: 'error', message });
  };

  return (
    <div className="pep-review-container">
      {reviewState.phase === 'idle' && (
        <ReviewButton
          prInfo={prInfo}
          onReviewStart={handleStart}
          onProgress={handleProgress}
          onFileComplete={handleFileComplete}
          onComplete={handleComplete}
          onError={handleError}
        />
      )}

      {reviewState.phase === 'reviewing' && (
        <>
          <ReviewButton prInfo={prInfo} disabled={true} />
          <ReviewProgressComponent
            progress={reviewState.progress}
            fileResults={reviewState.fileResults}
          />
        </>
      )}

      {reviewState.phase === 'complete' && (
        <>
          <ReviewButton
            prInfo={prInfo}
            onReviewStart={handleStart}
            onProgress={handleProgress}
            onFileComplete={handleFileComplete}
            onComplete={handleComplete}
            onError={handleError}
          />
          <div className="pep-review-complete">
            Review complete &mdash; {reviewState.summary.totalFindings} findings across{' '}
            {reviewState.summary.reviewedFiles} files. Comments posted to PR.
          </div>
        </>
      )}

      {reviewState.phase === 'error' && (
        <>
          <ReviewButton
            prInfo={prInfo}
            onReviewStart={handleStart}
            onProgress={handleProgress}
            onFileComplete={handleFileComplete}
            onComplete={handleComplete}
            onError={handleError}
          />
          <div className="pep-review-error">{reviewState.message}</div>
        </>
      )}
    </div>
  );
}
