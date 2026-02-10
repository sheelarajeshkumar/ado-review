/**
 * Root React component for the PEP Review content script UI.
 *
 * Receives parsed PR information and renders the review button.
 */

import type { PrInfo } from '@/shared/types';

interface AppProps {
  prInfo: PrInfo;
}

export default function App({ prInfo }: AppProps) {
  return <div>PEP Review - {prInfo.org}/{prInfo.project} PR #{prInfo.prId}</div>;
}
