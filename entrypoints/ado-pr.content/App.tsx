/**
 * Root React component for the PEP Review content script UI.
 *
 * Manages the review state machine (idle/reviewing/complete/error),
 * port communication via useReviewPort, and the floating panel UI.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PrInfo, ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';
import type { PortMessage } from '@/shared/messages';
import ReviewButton from './components/ReviewButton';
import ReviewPanel from './components/ReviewPanel';

type Phase = 'idle' | 'reviewing' | 'complete' | 'error';

interface ReviewState {
  phase: Phase;
  panelOpen: boolean;
  progress: ReviewProgress | null;
  fileResults: FileReviewResult[];
  summary: ReviewSummary | null;
  errorMessage: string | null;
}

const INITIAL_STATE: ReviewState = {
  phase: 'idle',
  panelOpen: false,
  progress: null,
  fileResults: [],
  summary: null,
  errorMessage: null,
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
    // Disconnect any lingering port
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

  const reset = useCallback(() => {
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
    activeRef.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { state, setState, startReview, reset };
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
  const { state, setState, startReview, reset } = useReviewPort(prInfo);
  const [copyLabel, setCopyLabel] = useState('Copy to Clipboard');
  const panelRef = useRef<HTMLDivElement>(null);

  // Button click: idle -> start review + open panel; otherwise toggle panel
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
      // Fallback: some browsers block clipboard in shadow DOM
      setCopyLabel('Copy failed');
      setTimeout(() => setCopyLabel('Copy to Clipboard'), 2000);
    }
  };

  const handleReviewAgain = () => {
    reset();
    // Small delay so state resets before starting
    setTimeout(() => startReview(), 0);
  };

  // Click outside panel to close
  useEffect(() => {
    if (!state.panelOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target as Node)) {
        handleClose();
      }
    };

    // Delay listener attachment to avoid the opening click closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [state.panelOpen, handleClose]);

  return (
    <div className="pep-review-container">
      <ReviewButton phase={state.phase} onClick={handleButtonClick} />
      {state.panelOpen && state.phase !== 'idle' && (
        <div ref={panelRef}>
          <ReviewPanel
            phase={state.phase as 'reviewing' | 'complete' | 'error'}
            progress={state.progress}
            fileResults={state.fileResults}
            summary={state.summary}
            errorMessage={state.errorMessage}
            onExport={handleExport}
            onCopy={handleCopy}
            onReviewAgain={handleReviewAgain}
            onClose={handleClose}
            copyLabel={copyLabel}
          />
        </div>
      )}
    </div>
  );
}
