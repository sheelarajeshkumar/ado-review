import { useState, useEffect } from 'react';
import { sendMessage } from '@/shared/messages';
import { clearPat, getAiProviderConfig, setAiProviderConfig, getOrgUrl, setOrgUrl } from '@/shared/storage';
import type { AuthStatus, AiProvider, AiProviderConfig } from '@/shared/types';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  ollama: 'llama3',
};

const MODEL_PLACEHOLDERS: Record<AiProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  ollama: 'llama3',
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  google: 'Google Gemini',
  ollama: 'Ollama (Local)',
};

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
  const [orgUrl, setOrgUrlState] = useState('');

  // AI provider config state
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [providerFeedback, setProviderFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fast model config state
  const [showFastModel, setShowFastModel] = useState(false);
  const [fastModel, setFastModel] = useState('');
  const [fastProvider, setFastProvider] = useState<AiProvider | ''>('');

  useEffect(() => {
    loadOrgUrl();
    loadProviderConfig();
  }, []);

  async function loadOrgUrl() {
    const stored = await getOrgUrl();
    if (stored) {
      setOrgUrlState(stored);
      checkAuthStatus(stored);
    }
  }

  async function loadProviderConfig() {
    const config = await getAiProviderConfig();
    if (config) {
      setProvider(config.provider);
      setModel(config.model);
      setApiKey(config.apiKey);
      setBaseUrl(config.baseUrl || '');
      if (config.fastModel) {
        setFastModel(config.fastModel);
        setFastProvider(config.fastProvider || '');
        setShowFastModel(true);
      }
    }
  }

  function handleProviderChange(newProvider: AiProvider) {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider]);
    setApiKey('');
    setBaseUrl(newProvider === 'ollama' ? 'http://localhost:11434/v1' : '');
    setProviderFeedback(null);
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // Validate: API key required for non-Ollama providers
    if (provider !== 'ollama' && !apiKey.trim()) return;

    setLoading(true);
    setProviderFeedback(null);

    try {
      const config: AiProviderConfig = {
        provider,
        model: model.trim() || DEFAULT_MODELS[provider],
        apiKey: apiKey.trim(),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
        ...(fastModel.trim() ? { fastModel: fastModel.trim() } : {}),
        ...(fastModel.trim() && fastProvider ? { fastProvider: fastProvider as AiProvider } : {}),
      };
      await setAiProviderConfig(config);
      setProviderFeedback({ type: 'success', message: `${PROVIDER_LABELS[provider]} configuration saved.` });
    } catch (err) {
      setProviderFeedback({ type: 'error', message: `Error: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  async function checkAuthStatus(url?: string) {
    const effectiveUrl = url || orgUrl;
    if (!effectiveUrl) {
      setAuthStatus({ authenticated: false, method: 'none' });
      return;
    }
    try {
      const result = await sendMessage('CHECK_AUTH', { orgUrl: effectiveUrl });
      setAuthStatus(result as AuthStatus);
    } catch {
      setAuthStatus({ authenticated: false, method: 'none' });
    }
  }

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgUrl.trim() || loading) return;

    setLoading(true);

    try {
      // Normalize: ensure it starts with https:// and has no trailing slash
      let normalized = orgUrl.trim().replace(/\/+$/, '');
      if (!normalized.startsWith('https://')) {
        normalized = `https://dev.azure.com/${normalized}`;
      }
      setOrgUrlState(normalized);
      await setOrgUrl(normalized);
      await checkAuthStatus(normalized);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!pat.trim() || !orgUrl.trim() || loading) return;

    setLoading(true);
    setFeedback(null);

    try {
      const result = await sendMessage('SAVE_PAT', { pat: pat.trim(), orgUrl: orgUrl.trim() }) as {
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
  const showApiKey = provider !== 'ollama';
  const showBaseUrl = provider === 'ollama' || provider === 'openai';

  return (
    <div className="container">
      <h1>PEP Review Settings</h1>

      <section className="auth-section">
        <h2>Azure DevOps Organization</h2>
        <p className="description">
          Enter your Azure DevOps organization name or full URL.
        </p>

        <form onSubmit={handleSaveOrg} className="pat-form">
          <div className="form-group">
            <label htmlFor="org-input">Organization</label>
            <input
              id="org-input"
              type="text"
              value={orgUrl}
              onChange={(e) => setOrgUrlState(e.target.value)}
              placeholder="PepsiCoIT or https://dev.azure.com/PepsiCoIT"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="button-group">
            <button type="submit" className="btn-primary" disabled={loading || !orgUrl.trim()}>
              {loading ? 'Saving...' : 'Save Organization'}
            </button>
          </div>
        </form>
      </section>

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
            <button type="submit" className="btn-primary" disabled={loading || !pat.trim() || !orgUrl.trim()}>
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
        <h2>AI Provider</h2>
        <p className="description">
          Choose your AI provider and model for code reviews.
        </p>

        <form onSubmit={handleSaveConfig} className="pat-form">
          <div className="form-group">
            <label htmlFor="provider-select">Provider</label>
            <select
              id="provider-select"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              disabled={loading}
            >
              <option value="openai">{PROVIDER_LABELS.openai}</option>
              <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
              <option value="google">{PROVIDER_LABELS.google}</option>
              <option value="ollama">{PROVIDER_LABELS.ollama}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="model-input">Model</label>
            <input
              id="model-input"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_PLACEHOLDERS[provider]}
              disabled={loading}
              autoComplete="off"
            />
          </div>

          {showApiKey && (
            <div className="form-group">
              <label htmlFor="apikey-input">API Key</label>
              <input
                id="apikey-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-...' : 'Enter API key'}
                disabled={loading}
                autoComplete="off"
              />
            </div>
          )}

          {showBaseUrl && (
            <div className="form-group">
              <label htmlFor="baseurl-input">
                Base URL {provider === 'openai' ? '(optional, for Azure OpenAI)' : ''}
              </label>
              <input
                id="baseurl-input"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://your-resource.openai.azure.com/...'}
                disabled={loading}
                autoComplete="off"
              />
            </div>
          )}

          <div className="form-divider" />

          <div className="advanced-section">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowFastModel(!showFastModel)}
              style={{ marginBottom: showFastModel ? 12 : 0 }}
            >
              {showFastModel ? 'Hide' : 'Show'} Fast Model (optional)
            </button>

            {showFastModel && (
              <>
                <p className="description" style={{ marginBottom: 12, marginTop: 0 }}>
                  Use a smaller, faster model for files with 150 lines or fewer.
                </p>

                <div className="form-group">
                  <label htmlFor="fast-provider-select">Fast Provider</label>
                  <select
                    id="fast-provider-select"
                    value={fastProvider}
                    onChange={(e) => setFastProvider(e.target.value as AiProvider | '')}
                    disabled={loading}
                  >
                    <option value="">Same as main provider</option>
                    <option value="openai">{PROVIDER_LABELS.openai}</option>
                    <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                    <option value="google">{PROVIDER_LABELS.google}</option>
                    <option value="ollama">{PROVIDER_LABELS.ollama}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="fast-model-input">Fast Model</label>
                  <input
                    id="fast-model-input"
                    type="text"
                    value={fastModel}
                    onChange={(e) => setFastModel(e.target.value)}
                    placeholder="gpt-4o-mini, gemini-2.0-flash-lite, etc."
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </div>

          <div className="button-group">
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || (showApiKey && !apiKey.trim())}
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>

        {providerFeedback && (
          <div className={`feedback feedback-${providerFeedback.type}`}>
            {providerFeedback.message}
          </div>
        )}
      </section>
    </div>
  );
}
