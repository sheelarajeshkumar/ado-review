/**
 * Root React component for the PEP Review content script UI.
 *
 * Manages the review state machine (idle/reviewing/complete/error),
 * port communication via useReviewPort, and the floating panel UI.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { PrInfo, ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';
import type { PortMessage } from '@/shared/messages';
import { sendMessage } from '@/shared/messages';
import { useTheme } from '@/lib/useTheme';
import ReviewButton from './components/ReviewButton';
import ReviewPanel from './components/ReviewPanel';
import { applyAnnotations, clearAnnotations } from './inline-annotations';

type Phase = 'idle' | 'reviewing' | 'complete' | 'error';

// --- Animated unmount hook ---

function useAnimatedUnmount(visible: boolean) {
  const [shouldRender, setShouldRender] = useState(visible);
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setAnimationClass('animate-slide-in');
    } else if (shouldRender) {
      setAnimationClass('animate-slide-out');
      const timer = setTimeout(() => setShouldRender(false), 150);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return { shouldRender, animationClass };
}

interface ReviewState {
  phase: Phase;
  panelOpen: boolean;
  progress: ReviewProgress | null;
  fileResults: FileReviewResult[];
  summary: ReviewSummary | null;
  errorMessage: string | null;
  isPartial: boolean;
}

const INITIAL_STATE: ReviewState = {
  phase: 'idle',
  panelOpen: false,
  progress: null,
  fileResults: [],
  summary: null,
  errorMessage: null,
  isPartial: false,
};

// --- Port hook ---

function useReviewPort(prInfo: PrInfo) {
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const activeRef = useRef(false);
  const [state, setState] = useState<ReviewState>(INITIAL_STATE);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (portRef.current) {
        portRef.current.disconnect();
        portRef.current = null;
      }
    };
  }, []);

  const startReview = useCallback(() => {
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }

    setState({
      phase: 'reviewing',
      panelOpen: true,
      progress: { currentFile: '', fileIndex: 0, totalFiles: 0, status: 'reviewing' },
      fileResults: [],
      summary: null,
      errorMessage: null,
      isPartial: false,
    });

    activeRef.current = true;
    const port = browser.runtime.connect({ name: 'review' });
    portRef.current = port;

    port.postMessage({ type: 'START_REVIEW', payload: { prInfo } });

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'REVIEW_PROGRESS':
          setState((prev) => (prev.phase === 'reviewing' ? { ...prev, progress: msg.payload } : prev));
          break;
        case 'REVIEW_FILE_COMPLETE':
          setState((prev) =>
            prev.phase === 'reviewing'
              ? { ...prev, fileResults: [...prev.fileResults, msg.payload] }
              : prev,
          );
          break;
        case 'REVIEW_COMPLETE':
          setState((prev) => ({
            ...prev,
            phase: 'complete',
            summary: msg.payload,
            isPartial: false,
          }));
          activeRef.current = false;
          port.disconnect();
          portRef.current = null;
          break;
        case 'REVIEW_ERROR':
          setState((prev) => ({
            ...prev,
            phase: 'error',
            errorMessage: msg.payload.message,
          }));
          activeRef.current = false;
          port.disconnect();
          portRef.current = null;
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      if (activeRef.current) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          errorMessage: 'Connection to service worker lost',
        }));
        activeRef.current = false;
      }
      portRef.current = null;
    });
  }, [prInfo]);

  const stopReview = useCallback(() => {
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
    activeRef.current = false;

    setState((prev) => {
      if (prev.phase !== 'reviewing') return prev;
      const allFindings = prev.fileResults.flatMap((r) => r.findings ?? []);
      const totalFiles = prev.progress?.totalFiles ?? 0;
      const partialSummary: ReviewSummary = {
        totalFiles,
        reviewedFiles: prev.fileResults.filter((r) => r.status === 'success').length,
        skippedFiles: 0,
        errorFiles: prev.fileResults.filter((r) => r.status === 'error').length,
        totalFindings: allFindings.length,
        findingsBySeverity: {
          Critical: allFindings.filter((f) => f.severity === 'Critical').length,
          Warning: allFindings.filter((f) => f.severity === 'Warning').length,
          Info: allFindings.filter((f) => f.severity === 'Info').length,
        },
        durationMs: 0,
        iterationId: 0,
        prTitle: '',
      };
      return { ...prev, phase: 'complete', summary: partialSummary, isPartial: true };
    });
  }, []);

  const reset = useCallback(() => {
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
    activeRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { state, setState, startReview, stopReview, reset };
}

// --- Markdown builder ---

function buildMarkdown(fileResults: FileReviewResult[], summary: ReviewSummary | null): string {
  const lines: string[] = ['# PEP Review Results', ''];

  if (summary) {
    lines.push(
      `**${summary.reviewedFiles}** files reviewed, **${summary.totalFindings}** findings`,
      `(Critical: ${summary.findingsBySeverity.Critical}, Warning: ${summary.findingsBySeverity.Warning}, Info: ${summary.findingsBySeverity.Info})`,
      '',
    );
  }

  for (const file of fileResults) {
    if (file.status !== 'success' || !file.findings?.length) continue;

    lines.push(`## ${file.filePath}`, '');
    for (const f of file.findings) {
      lines.push(`- **L${f.line}** [${f.severity}] ${f.message}`);
      if (f.suggestion) lines.push(`  - Suggestion: ${f.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- App ---

interface AppProps {
  prInfo: PrInfo;
}

export default function App({ prInfo }: AppProps) {
  const { state, setState, startReview, stopReview, reset } = useReviewPort(prInfo);
  const { theme, toggleTheme, isDark } = useTheme();
  const [copyLabel, setCopyLabel] = useState('Copy to Clipboard');
  const [postLabel, setPostLabel] = useState('Post to PR');
  const [posting, setPosting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const panelVisible = state.panelOpen && state.phase !== 'idle';
  const { shouldRender: shouldRenderPanel, animationClass } = useAnimatedUnmount(panelVisible);

  const updatePanelPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 8,
      right: Math.max(0, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!state.panelOpen) return;
    updatePanelPosition();
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [state.panelOpen, updatePanelPosition]);

  const panelStyle = useMemo<React.CSSProperties>(
    () => ({ top: panelPos.top, right: panelPos.right }),
    [panelPos.top, panelPos.right],
  );

  // Apply inline annotations when review completes
  useEffect(() => {
    if (state.phase === 'complete' && state.fileResults.length > 0) {
      const timer = setTimeout(() => applyAnnotations(state.fileResults), 500);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.fileResults]);

  // Cleanup annotations on unmount
  useEffect(() => () => clearAnnotations(), []);

  const handleButtonClick = () => {
    if (state.phase === 'idle') {
      startReview();
    } else {
      setState((prev) => ({ ...prev, panelOpen: !prev.panelOpen }));
    }
  };

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, panelOpen: false }));
  }, [setState]);

  const handleExport = () => {
    const md = buildMarkdown(state.fileResults, state.summary);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pep-review-findings.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const md = buildMarkdown(state.fileResults, state.summary);
    try {
      await navigator.clipboard.writeText(md);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
    } catch {
      setCopyLabel('Copy failed');
      setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
    }
  };

  const handleReviewAgain = () => {
    clearAnnotations();
    reset();
    setPostLabel('Post to PR');
    setPosting(false);
    setTimeout(() => startReview(), 0);
  };

  const handleDiscard = () => {
    clearAnnotations();
    reset();
    setPostLabel('Post to PR');
    setPosting(false);
  };

  const handlePostToPr = async () => {
    if (posting || !state.summary || state.isPartial) return;
    setPosting(true);
    setPostLabel('Posting\u2026');
    try {
      const result = (await sendMessage('POST_REVIEW_COMMENTS', {
        prInfo,
        fileResults: state.fileResults,
        iterationId: state.summary.iterationId,
        prTitle: state.summary.prTitle,
      })) as { success: boolean; error?: string };

      if (result.success) {
        setPostLabel('Posted!');
      } else {
        setPostLabel('Post failed');
        setTimeout(() => setPostLabel('Post to PR'), 3000);
      }
    } catch {
      setPostLabel('Post failed');
      setTimeout(() => setPostLabel('Post to PR'), 3000);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="relative inline-block" ref={containerRef}>
        <ReviewButton phase={state.phase} onClick={handleButtonClick} />
        {shouldRenderPanel && (
          <ReviewPanel
            panelStyle={panelStyle}
            animationClass={animationClass}
            phase={state.phase as 'reviewing' | 'complete' | 'error'}
            progress={state.progress}
            fileResults={state.fileResults}
            summary={state.summary}
            errorMessage={state.errorMessage}
            isPartial={state.isPartial}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onExport={handleExport}
            onCopy={handleCopy}
            onPostToPr={handlePostToPr}
            onReviewAgain={handleReviewAgain}
            onStop={stopReview}
            onDiscard={handleDiscard}
            onClose={handleClose}
            copyLabel={copyLabel}
            postLabel={postLabel}
          />
        )}
      </div>
    </div>
  );
}
