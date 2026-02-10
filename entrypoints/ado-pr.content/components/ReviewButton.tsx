/**
 * Review button component injected into Azure DevOps PR pages.
 *
 * Opens a browser.runtime.connect port for long-lived review sessions
 * and dispatches progress/completion/error callbacks to the parent App.
 */

import { useState, useRef, useEffect } from 'react';
import type { PrInfo, ReviewProgress, FileReviewResult, ReviewSummary } from '@/shared/types';
import type { PortMessage } from '@/shared/messages';

interface ReviewButtonProps {
  prInfo: PrInfo;
  disabled?: boolean;
  onReviewStart?: () => void;
  onProgress?: (progress: ReviewProgress) => void;
  onFileComplete?: (result: FileReviewResult) => void;
  onComplete?: (summary: ReviewSummary) => void;
  onError?: (message: string) => void;
}

export default function ReviewButton({
  prInfo,
  disabled,
  onReviewStart,
  onProgress,
  onFileComplete,
  onComplete,
  onError,
}: ReviewButtonProps) {
  const [active, setActive] = useState(false);
  const portRef = useRef<ReturnType<typeof browser.runtime.connect> | null>(null);
  const activeRef = useRef(false);

  // Keep activeRef in sync with active state
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Cleanup port on unmount
  useEffect(() => {
    return () => {
      if (portRef.current) {
        portRef.current.disconnect();
        portRef.current = null;
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled || active) return;

    setActive(true);
    activeRef.current = true;
    onReviewStart?.();

    const port = browser.runtime.connect({ name: 'review' });
    portRef.current = port;

    port.postMessage({ type: 'START_REVIEW', payload: { prInfo } });

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'REVIEW_PROGRESS':
          onProgress?.(msg.payload);
          break;
        case 'REVIEW_FILE_COMPLETE':
          onFileComplete?.(msg.payload);
          break;
        case 'REVIEW_COMPLETE':
          onComplete?.(msg.payload);
          port.disconnect();
          portRef.current = null;
          setActive(false);
          break;
        case 'REVIEW_ERROR':
          onError?.(msg.payload.message);
          port.disconnect();
          portRef.current = null;
          setActive(false);
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      if (activeRef.current) {
        onError?.('Connection to service worker lost');
        setActive(false);
      }
      portRef.current = null;
    });
  };

  const isDisabled = active || disabled;

  return (
    <button
      className={`pep-review-btn${isDisabled ? ' pep-review-btn--reviewing' : ''}`}
      onClick={handleClick}
      disabled={isDisabled}
      type="button"
    >
      {isDisabled ? 'Reviewing\u2026' : 'PEP Review'}
    </button>
  );
}
