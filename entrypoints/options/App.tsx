import { useState, useEffect } from 'react';
import { sendMessage } from '@/shared/messages';
import { clearPat, getOpenAiApiKey, setOpenAiApiKey } from '@/shared/storage';
import type { AuthStatus } from '@/shared/types';

/**
 * Options page for PEP Review extension.
 *
 * Displays current auth status and provides PAT entry form
 * with validation feedback.
 */
export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [pat, setPat] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyFeedback, setApiKeyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    checkAuthStatus();
    loadApiKey();
  }, []);

  async function loadApiKey() {
    const key = await getOpenAiApiKey();
    if (key) setApiKey(key);
  }

  async function handleSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || loading) return;

    setLoading(true);
    setApiKeyFeedback(null);

    try {
      await setOpenAiApiKey(apiKey.trim());
      setApiKeyFeedback({ type: 'success', message: 'OpenAI API key saved.' });
    } catch (err) {
      setApiKeyFeedback({ type: 'error', message: `Error: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  async function checkAuthStatus() {
    try {
      const result = await sendMessage('CHECK_AUTH', { orgUrl: 'https://dev.azure.com' });
      setAuthStatus(result as AuthStatus);
    } catch {
      setAuthStatus({ authenticated: false, method: 'none' });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pat.trim() || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const result = await sendMessage('SAVE_PAT', { pat: pat.trim() }) as {
        success: boolean;
        error?: string;
      };

      if (result.success) {
        setFeedback({ type: 'success', message: 'PAT saved and verified successfully.' });
        setPat('');
        await checkAuthStatus();
      } else {
        setFeedback({ type: 'error', message: result.error || 'Failed to save PAT.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: `Error: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      await clearPat();
      setFeedback({ type: 'success', message: 'PAT cleared.' });
      await checkAuthStatus();
    } catch (err) {
      setFeedback({ type: 'error', message: `Error clearing PAT: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  function getStatusDisplay() {
    if (!authStatus) return { text: 'Checking...', className: 'status-checking' };

    switch (authStatus.method) {
      case 'session':
        return { text: 'Session active', className: 'status-session' };
      case 'pat':
        return { text: 'Using PAT', className: 'status-pat' };
      default:
        return { text: 'Not authenticated', className: 'status-none' };
    }
  }

  const status = getStatusDisplay();

  return (
    <div className="container">
      <h1>PEP Review Settings</h1>

      <section className="auth-section">
        <h2>Azure DevOps Authentication</h2>
        <p className="description">
          The extension first tries to use your browser session. If that
          doesn't work, enter a Personal Access Token below.
        </p>

        <div className={`auth-status ${status.className}`}>
          <span className="status-dot" />
          <span className="status-text">{status.text}</span>
        </div>

        <form onSubmit={handleSave} className="pat-form">
          <div className="form-group">
            <label htmlFor="pat-input">Personal Access Token</label>
            <input
              id="pat-input"
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              placeholder="Enter your Azure DevOps PAT"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="button-group">
            <button type="submit" className="btn-primary" disabled={loading || !pat.trim()}>
              {loading ? 'Saving...' : 'Save PAT'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleClear} disabled={loading}>
              Clear PAT
            </button>
          </div>
        </form>

        {feedback && (
          <div className={`feedback feedback-${feedback.type}`}>
            {feedback.message}
          </div>
        )}
      </section>

      <section className="auth-section">
        <h2>LLM Configuration</h2>
        <h3>OpenAI API Key</h3>
        <p className="description">
          Enter your OpenAI API key for AI-powered code reviews.
        </p>

        <form onSubmit={handleSaveApiKey} className="pat-form">
          <div className="form-group">
            <label htmlFor="apikey-input">API Key</label>
            <input
              id="apikey-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="button-group">
            <button type="submit" className="btn-primary" disabled={loading || !apiKey.trim()}>
              {loading ? 'Saving...' : 'Save API Key'}
            </button>
          </div>
        </form>

        {apiKeyFeedback && (
          <div className={`feedback feedback-${apiKeyFeedback.type}`}>
            {apiKeyFeedback.message}
          </div>
        )}
      </section>
    </div>
  );
}
