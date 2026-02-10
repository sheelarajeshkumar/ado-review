/**
 * Root React component for the PEP Review content script UI.
 *
 * Thin wrapper that receives parsed PR information and renders the
 * review button. Will grow in later phases to include progress UI,
 * error states, and review results.
 */

import type { PrInfo } from '@/shared/types';
import ReviewButton from './components/ReviewButton';

interface AppProps {
  prInfo: PrInfo;
}

export default function App({ prInfo }: AppProps) {
  return <ReviewButton prInfo={prInfo} />;
}
