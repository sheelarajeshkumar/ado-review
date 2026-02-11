import { cn } from './cn';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

export function ThemeToggle({ isDark, onToggle, size = 'sm' }: ThemeToggleProps) {
  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0',
        'rounded-full border border-fluent-border transition-all duration-200',
        'bg-fluent-bg-subtle hover:bg-fluent-bg-hover cursor-pointer',
        isSmall ? 'w-7 h-7' : 'w-9 h-9',
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {/* Sun icon */}
      <svg
        className={cn(
          'absolute transition-all duration-200',
          isSmall ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5',
          isDark
            ? 'opacity-0 rotate-90 scale-0'
            : 'opacity-100 rotate-0 scale-100 text-amber-500',
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>

      {/* Moon icon */}
      <svg
        className={cn(
          'absolute transition-all duration-200',
          isSmall ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5',
          isDark
            ? 'opacity-100 rotate-0 scale-100 text-blue-300'
            : 'opacity-0 -rotate-90 scale-0',
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
