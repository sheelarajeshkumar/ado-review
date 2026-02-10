import { useState, useEffect } from 'react';
import { sendMessage } from '@/shared/messages';
import type { AuthStatus } from '@/shared/types';

/**
 * Popup showing extension name and current auth status.
 *
 * Sends CHECK_AUTH on mount and displays a colored status indicator.
 * Links to the options page for PAT configuration.
 */
export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    sendMessage('CHECK_AUTH', { orgUrl: 'https://dev.azure.com' })
      .then((result) => setAuthStatus(result as AuthStatus))
      .catch(() => setAuthStatus({ authenticated: false, method: 'none' }));
  }, []);

  function getStatusDisplay() {
    if (!authStatus) return { text: 'Checking...', dotColor: '#999' };

    switch (authStatus.method) {
      case 'session':
        return { text: 'Connected', dotColor: '#1e7e34' };
      case 'pat':
        return { text: 'PAT', dotColor: '#c77c00' };
      default:
        return { text: 'Not connected', dotColor: '#c62828' };
    }
  }

  function openOptions() {
    browser.runtime.openOptionsPage();
  }

  const status = getStatusDisplay();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>PEP Review</h1>
      </div>

      <div style={styles.statusRow}>
        <span
          style={{
            ...styles.dot,
            backgroundColor: status.dotColor,
          }}
        />
        <span style={styles.statusText}>{status.text}</span>
      </div>

      <button style={styles.settingsLink} onClick={openOptions}>
        Settings
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 300,
    padding: '16px 20px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: 14,
    color: '#444',
  },
  settingsLink: {
    background: 'none',
    border: 'none',
    color: '#0078d4',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline',
  },
};
