/**
 * Review button component injected into Azure DevOps PR pages.
 *
 * In Phase 1, clicking the button sends a CHECK_AUTH message to the
 * background service worker and displays the auth result as feedback.
 * Phase 2 will add actual review-triggering logic.
 */

import { useState } from 'react';
import type { PrInfo } from '@/shared/types';
import type { AuthStatus } from '@/shared/types';
import { sendMessage } from '@/shared/messages';

type ButtonState = 'idle' | 'checking' | 'authenticated' | 'unauthenticated';

interface ReviewButtonProps {
  prInfo: PrInfo;
}

export default function ReviewButton({ prInfo }: ReviewButtonProps) {
  const [state, setState] = useState<ButtonState>('idle');
  const [authMethod, setAuthMethod] = useState<string>('');

  const handleClick = async () => {
    if (state === 'checking') return;

    setState('checking');

    try {
      const result = (await sendMessage('CHECK_AUTH', {
        orgUrl: prInfo.baseUrl,
      })) as AuthStatus;

      if (result?.authenticated) {
        setAuthMethod(result.method);
        setState('authenticated');
      } else {
        setState('unauthenticated');
      }
    } catch (error) {
      console.error('[PEP Review] Auth check failed:', error);
      setState('unauthenticated');
    }

    // Revert to idle after 2 seconds
    setTimeout(() => {
      setState('idle');
      setAuthMethod('');
    }, 2000);
  };

  const getButtonText = (): string => {
    switch (state) {
      case 'idle':
        return '\u{1F50D} PEP Review';
      case 'checking':
        return 'Checking\u2026';
      case 'authenticated':
        return `\u2713 Authenticated (${authMethod})`;
      case 'unauthenticated':
        return '\u2717 Not authenticated';
    }
  };

  const getClassName = (): string => {
    const base = 'pep-review-btn';
    if (state === 'idle') return base;
    return `${base} ${base}--${state}`;
  };

  return (
    <button
      className={getClassName()}
      onClick={handleClick}
      disabled={state === 'checking'}
      type="button"
    >
      {getButtonText()}
    </button>
  );
}
