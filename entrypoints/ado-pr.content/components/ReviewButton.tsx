import { cn } from '@/lib/cn';

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
      label = 'ADO Review';
      break;
    default:
      label = 'ADO Review';
  }

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 border-none rounded',
        'font-sans text-[13px] font-semibold leading-none cursor-pointer whitespace-nowrap',
        'transition-colors duration-150',
        isReviewing
          ? 'bg-fluent-text-secondary text-white cursor-wait animate-pulse-subtle'
          : 'bg-fluent-primary text-white hover:bg-fluent-primary-hover active:bg-fluent-primary-active',
        isReviewing && 'pointer-events-none',
      )}
      onClick={onClick}
      disabled={isReviewing}
      type="button"
    >
      {label}
    </button>
  );
}
