/**
 * Presentational review button injected into Azure DevOps PR pages.
 *
 * Renders button text/state based on the current review phase.
 * All port logic lives in the parent App via useReviewPort.
 */

interface ReviewButtonProps {
  phase: 'idle' | 'reviewing' | 'complete' | 'error';
  onClick: () => void;
}

export default function ReviewButton({ phase, onClick }: ReviewButtonProps) {
  const isReviewing = phase === 'reviewing';

  let label: string;
  switch (phase) {
    case 'reviewing':
      label = 'Reviewing\u2026';
      break;
    case 'complete':
    case 'error':
      label = 'PEP Review';
      break;
    default:
      label = 'PEP Review';
  }

  return (
    <button
      className={`pep-review-btn${isReviewing ? ' pep-review-btn--reviewing' : ''}`}
      onClick={onClick}
      disabled={isReviewing}
      type="button"
    >
      {label}
    </button>
  );
}
