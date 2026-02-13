import { useState, useEffect } from 'react';
import { sendMessage } from '@/shared/messages';
import { getAiProviderConfig, getReviewStats } from '@/shared/storage';
import { useTheme } from '@/lib/useTheme';
import { ThemeToggle } from '@/lib/ThemeToggle';
import { cn } from '@/lib/cn';
import type { AuthStatus, AiProviderConfig } from '@/shared/types';
import type { ReviewStats } from '@/shared/storage';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  ollama: 'Ollama',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [providerConfig, setProviderConfig] = useState<AiProviderConfig | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    sendMessage('CHECK_AUTH', { orgUrl: 'https://dev.azure.com' })
      .then((result) => setAuthStatus(result as AuthStatus))
      .catch(() => setAuthStatus({ authenticated: false, method: 'none' }));
    getAiProviderConfig().then(setProviderConfig);
    getReviewStats().then(setStats);
  }, []);

  const connStatus = !authStatus
    ? { label: 'Checking...', color: 'bg-status-checking-bg text-status-checking-text', dot: 'bg-status-checking-text' }
    : authStatus.method === 'session'
      ? { label: 'Connected', color: 'bg-status-session-bg text-status-session-text', dot: 'bg-status-session-text' }
      : authStatus.method === 'pat'
        ? { label: 'PAT', color: 'bg-status-pat-bg text-status-pat-text', dot: 'bg-status-pat-text' }
        : { label: 'Not connected', color: 'bg-status-none-bg text-status-none-text', dot: 'bg-status-none-text' };

  const providerLabel = providerConfig
    ? PROVIDER_LABELS[providerConfig.provider] ?? providerConfig.provider
    : null;

  const s = stats ?? {
    totalReviews: 0,
    totalFindings: 0,
    totalFilesReviewed: 0,
    findingsBySeverity: { Critical: 0, Warning: 0, Info: 0 },
    lastReviewAt: null,
  };

  return (
    <div className={cn('w-[340px] font-sans', isDark && 'dark')}>
      <div className="bg-fluent-bg text-fluent-text">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-fluent-primary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight">ADO Review</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} size="sm" />
            <button
              type="button"
              onClick={() => browser.runtime.openOptionsPage()}
              title="Settings"
              className="w-7 h-7 rounded-full flex items-center justify-center text-fluent-text-secondary hover:bg-fluent-bg-hover transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status + Provider card */}
        <div className="mx-4 mb-3 rounded-lg border border-fluent-border-subtle bg-fluent-bg-subtle px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', connStatus.dot)} />
              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', connStatus.color)}>
                {connStatus.label}
              </span>
            </div>
            {providerLabel && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-fluent-text-secondary">{providerLabel}</span>
                {providerConfig?.model && (
                  <span className="text-fluent-text-disabled bg-fluent-bg px-1.5 py-0.5 rounded text-[10px]">
                    {providerConfig.model}
                  </span>
                )}
              </div>
            )}
            {!providerConfig && (
              <span className="text-xs text-fluent-text-disabled italic">No AI configured</span>
            )}
          </div>
        </div>

        {/* Donut chart + headline stats */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-4">
            {/* Donut ring chart */}
            <DonutChart
              critical={s.findingsBySeverity.Critical}
              warning={s.findingsBySeverity.Warning}
              info={s.findingsBySeverity.Info}
              total={s.totalFindings}
            />

            {/* Stats grid */}
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
              <StatRow label="Reviews" value={s.totalReviews} />
              <StatRow label="Files" value={s.totalFilesReviewed} />
              <StatRow label="Findings" value={s.totalFindings} />
              {s.lastReviewAt ? (
                <StatRow label="Last" value={formatRelativeTime(s.lastReviewAt)} />
              ) : (
                <StatRow label="Last" value="--" />
              )}
            </div>
          </div>
        </div>

        {/* Severity bar chart */}
        <div className="px-4 pb-3">
          <div className="space-y-1.5">
            <SeverityBar
              label="Critical"
              count={s.findingsBySeverity.Critical}
              total={s.totalFindings}
              barColor="bg-severity-critical-border"
              textColor="text-severity-critical-text"
              bgColor="bg-severity-critical-bg"
            />
            <SeverityBar
              label="Warning"
              count={s.findingsBySeverity.Warning}
              total={s.totalFindings}
              barColor="bg-severity-warning-border"
              textColor="text-severity-warning-text"
              bgColor="bg-severity-warning-bg"
            />
            <SeverityBar
              label="Info"
              count={s.findingsBySeverity.Info}
              total={s.totalFindings}
              barColor="bg-severity-info-border"
              textColor="text-severity-info-text"
              bgColor="bg-severity-info-bg"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="h-px bg-fluent-border" />
        <div className="px-4 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => browser.runtime.openOptionsPage()}
            className="text-xs text-fluent-primary hover:text-fluent-primary-hover transition-colors cursor-pointer"
          >
            Open settings
          </button>
          <span className="text-[10px] text-fluent-text-disabled">v0.1.0</span>
        </div>
      </div>
    </div>
  );
}

/* ---- Donut Ring Chart ---- */

function DonutChart({
  critical,
  warning,
  info,
  total,
}: {
  critical: number;
  warning: number;
  info: number;
  total: number;
}) {
  const size = 72;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Segment offsets (clockwise from top)
  const segments: Array<{ value: number; colorVar: string }> = [
    { value: critical, colorVar: 'var(--color-severity-critical-border)' },
    { value: warning, colorVar: 'var(--color-severity-warning-border)' },
    { value: info, colorVar: 'var(--color-severity-info-border)' },
  ];

  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const dashLength = fraction * circumference;
    const dashGap = circumference - dashLength;
    const offset = -(accumulated * circumference) + circumference / 4;
    accumulated += fraction;
    return { ...seg, dashLength, dashGap, offset };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-fluent-border-subtle)"
          strokeWidth={strokeWidth}
        />
        {/* Severity segments */}
        {total > 0 &&
          arcs.map((arc, i) =>
            arc.value > 0 ? (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.colorVar}
                strokeWidth={strokeWidth}
                strokeDasharray={`${arc.dashLength} ${arc.dashGap}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            ) : null,
          )}
      </svg>
      {/* Center number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold leading-none text-fluent-text">{total}</span>
        <span className="text-[9px] text-fluent-text-disabled mt-0.5">findings</span>
      </div>
    </div>
  );
}

/* ---- Stat Row ---- */

function StatRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-fluent-text-secondary">{label}</span>
      <span className="text-sm font-semibold text-fluent-text">{value}</span>
    </div>
  );
}

/* ---- Severity Horizontal Bar ---- */

function SeverityBar({
  label,
  count,
  total,
  barColor,
  textColor,
  bgColor,
}: {
  label: string;
  count: number;
  total: number;
  barColor: string;
  textColor: string;
  bgColor: string;
}) {
  const pct = total > 0 ? Math.max(2, (count / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-[52px] text-[11px] font-medium shrink-0', textColor)}>{label}</span>
      <div className={cn('flex-1 h-2 rounded-full overflow-hidden', bgColor)}>
        {count > 0 && (
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className={cn('w-6 text-right text-[11px] font-semibold tabular-nums', textColor)}>
        {count}
      </span>
    </div>
  );
}
