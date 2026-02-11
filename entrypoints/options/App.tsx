import { useState, useEffect } from 'react';
import { sendMessage } from '@/shared/messages';
import { clearPat, getAiProviderConfig, setAiProviderConfig, getOrgUrl, setOrgUrl } from '@/shared/storage';
import type { AuthStatus, AiProvider, AiProviderConfig } from '@/shared/types';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/useTheme';
import { ThemeToggle } from '@/lib/ThemeToggle';

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

const inputClass =
  'w-full px-3 py-2.5 text-sm border border-fluent-border rounded-lg outline-none bg-fluent-bg text-fluent-text transition-all duration-150 focus:border-fluent-primary focus:ring-2 focus:ring-fluent-primary/15 disabled:bg-fluent-bg-subtle disabled:text-fluent-text-disabled placeholder:text-fluent-text-disabled';

const btnPrimary =
  'px-5 py-2.5 text-sm font-medium border-none rounded-lg cursor-pointer bg-fluent-primary text-white transition-all duration-150 hover:bg-fluent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed';

const btnSecondary =
  'px-5 py-2.5 text-sm font-medium border border-fluent-border rounded-lg cursor-pointer bg-fluent-bg-subtle text-fluent-text transition-all duration-150 hover:bg-fluent-bg-hover disabled:opacity-50 disabled:cursor-not-allowed';

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [pat, setPat] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgUrl, setOrgUrlState] = useState('');

  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [providerFeedback, setProviderFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [showFastModel, setShowFastModel] = useState(false);
  const [fastModel, setFastModel] = useState('');
  const [fastProvider, setFastProvider] = useState<AiProvider | ''>('');

  // Apply dark class to documentElement so it scopes the whole page
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

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
    if (!authStatus) return { text: 'Checking...', className: 'bg-status-checking-bg text-status-checking-text' };

    switch (authStatus.method) {
      case 'session':
        return { text: 'Session active', className: 'bg-status-session-bg text-status-session-text' };
      case 'pat':
        return { text: 'Using PAT', className: 'bg-status-pat-bg text-status-pat-text' };
      default:
        return { text: 'Not authenticated', className: 'bg-status-none-bg text-status-none-text' };
    }
  }

  function getStatusDotColor() {
    if (!authStatus) return 'bg-fluent-text-disabled';
    switch (authStatus.method) {
      case 'session': return 'bg-status-session-text';
      case 'pat': return 'bg-status-pat-text';
      default: return 'bg-status-none-text';
    }
  }

  const status = getStatusDisplay();
  const showApiKey = provider !== 'ollama';
  const showBaseUrl = provider === 'ollama' || provider === 'openai';

  return (
    <div className="min-h-screen bg-fluent-bg-page transition-colors duration-200">
      <div className="max-w-xl mx-auto px-6 py-8 font-sans text-fluent-text leading-normal">
        {/* Header with theme toggle */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-fluent-text">PEP Review Settings</h1>
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} size="md" />
        </div>

        <div className="space-y-4">
          {/* Organization Card */}
          <section className="bg-fluent-bg border border-fluent-border rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-1.5 text-fluent-text">Azure DevOps Organization</h2>
            <p className="text-fluent-text-secondary text-sm mb-5">
              Enter your Azure DevOps organization name or full URL.
            </p>

            <form onSubmit={handleSaveOrg}>
              <div className="mb-4">
                <label htmlFor="org-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Organization</label>
                <input
                  id="org-input"
                  type="text"
                  value={orgUrl}
                  onChange={(e) => setOrgUrlState(e.target.value)}
                  placeholder="PepsiCoIT or https://dev.azure.com/PepsiCoIT"
                  disabled={loading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" className={btnPrimary} disabled={loading || !orgUrl.trim()}>
                  {loading ? 'Saving...' : 'Save Organization'}
                </button>
              </div>
            </form>
          </section>

          {/* Authentication Card */}
          <section className="bg-fluent-bg border border-fluent-border rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-1.5 text-fluent-text">Azure DevOps Authentication</h2>
            <p className="text-fluent-text-secondary text-sm mb-5">
              The extension first tries to use your browser session. If that
              doesn't work, enter a Personal Access Token below.
            </p>

            <div className={cn('flex items-center gap-2.5 px-4 py-3 rounded-lg mb-5 text-sm font-medium', status.className)}>
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', getStatusDotColor())} />
              <span>{status.text}</span>
            </div>

            <form onSubmit={handleSave}>
              <div className="mb-4">
                <label htmlFor="pat-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Personal Access Token</label>
                <input
                  id="pat-input"
                  type="password"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  placeholder="Enter your Azure DevOps PAT"
                  disabled={loading}
                  autoComplete="off"
                  className={cn(inputClass, 'font-mono')}
                />
              </div>

              <div className="flex gap-3">
                <button type="submit" className={btnPrimary} disabled={loading || !pat.trim() || !orgUrl.trim()}>
                  {loading ? 'Saving...' : 'Save PAT'}
                </button>
                <button type="button" className={btnSecondary} onClick={handleClear} disabled={loading}>
                  Clear PAT
                </button>
              </div>
            </form>

            {feedback && (
              <div className={cn(
                'px-4 py-3 rounded-lg text-sm mt-4 border',
                feedback.type === 'success' && 'bg-status-session-bg text-status-session-text border-severity-clean-border',
                feedback.type === 'error' && 'bg-status-none-bg text-status-none-text border-severity-critical-border',
              )}>
                {feedback.message}
              </div>
            )}
          </section>

          {/* AI Provider Card */}
          <section className="bg-fluent-bg border border-fluent-border rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-1.5 text-fluent-text">AI Provider</h2>
            <p className="text-fluent-text-secondary text-sm mb-5">
              Choose your AI provider and model for code reviews.
            </p>

            <form onSubmit={handleSaveConfig}>
              <div className="mb-4">
                <label htmlFor="provider-select" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Provider</label>
                <select
                  id="provider-select"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                  disabled={loading}
                  className={cn(inputClass, 'font-sans cursor-pointer')}
                >
                  <option value="openai">{PROVIDER_LABELS.openai}</option>
                  <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                  <option value="google">{PROVIDER_LABELS.google}</option>
                  <option value="ollama">{PROVIDER_LABELS.ollama}</option>
                </select>
              </div>

              <div className="mb-4">
                <label htmlFor="model-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Model</label>
                <input
                  id="model-input"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={MODEL_PLACEHOLDERS[provider]}
                  disabled={loading}
                  autoComplete="off"
                  className={cn(inputClass, 'font-mono')}
                />
              </div>

              {showApiKey && (
                <div className="mb-4">
                  <label htmlFor="apikey-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">API Key</label>
                  <input
                    id="apikey-input"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider === 'openai' ? 'sk-...' : 'Enter API key'}
                    disabled={loading}
                    autoComplete="off"
                    className={cn(inputClass, 'font-mono')}
                  />
                </div>
              )}

              {showBaseUrl && (
                <div className="mb-4">
                  <label htmlFor="baseurl-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">
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
                    className={inputClass}
                  />
                </div>
              )}

              <hr className="border-t border-fluent-border-subtle my-5" />

              <div className="mb-4">
                <button
                  type="button"
                  className={cn(btnSecondary, showFastModel && 'mb-3')}
                  onClick={() => setShowFastModel(!showFastModel)}
                >
                  {showFastModel ? 'Hide' : 'Show'} Fast Model (optional)
                </button>

                {showFastModel && (
                  <>
                    <p className="text-fluent-text-secondary text-sm mb-3">
                      Use a smaller, faster model for files with 150 lines or fewer.
                    </p>

                    <div className="mb-4">
                      <label htmlFor="fast-provider-select" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Fast Provider</label>
                      <select
                        id="fast-provider-select"
                        value={fastProvider}
                        onChange={(e) => setFastProvider(e.target.value as AiProvider | '')}
                        disabled={loading}
                        className={cn(inputClass, 'font-sans cursor-pointer')}
                      >
                        <option value="">Same as main provider</option>
                        <option value="openai">{PROVIDER_LABELS.openai}</option>
                        <option value="anthropic">{PROVIDER_LABELS.anthropic}</option>
                        <option value="google">{PROVIDER_LABELS.google}</option>
                        <option value="ollama">{PROVIDER_LABELS.ollama}</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label htmlFor="fast-model-input" className="block text-sm font-medium mb-1.5 text-fluent-text-secondary">Fast Model</label>
                      <input
                        id="fast-model-input"
                        type="text"
                        value={fastModel}
                        onChange={(e) => setFastModel(e.target.value)}
                        placeholder="gpt-4o-mini, gemini-2.0-flash-lite, etc."
                        disabled={loading}
                        autoComplete="off"
                        className={cn(inputClass, 'font-mono')}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className={btnPrimary}
                  disabled={loading || (showApiKey && !apiKey.trim())}
                >
                  {loading ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>

            {providerFeedback && (
              <div className={cn(
                'px-4 py-3 rounded-lg text-sm mt-4 border',
                providerFeedback.type === 'success' && 'bg-status-session-bg text-status-session-text border-severity-clean-border',
                providerFeedback.type === 'error' && 'bg-status-none-bg text-status-none-text border-severity-critical-border',
              )}>
                {providerFeedback.message}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
