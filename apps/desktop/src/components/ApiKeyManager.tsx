import { useState, useEffect } from 'react';
import { getApiKeyInfo, regenerateApiKey as regenerateApiKeyApi } from '../services/api';
import type { ApiKeyInfo } from '@my-claudia/shared';

export function ApiKeyManager() {
  const [keyInfo, setKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [showFullKey, setShowFullKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKeyInfo();
  }, []);

  const loadKeyInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await getApiKeyInfo();
      setKeyInfo(info);
    } catch (err) {
      console.error('Failed to load API key info:', err);
      setError('Failed to load API key info');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (keyInfo?.fullKey) {
      try {
        await navigator.clipboard.writeText(keyInfo.fullKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error('Failed to copy to clipboard');
      }
    }
  };

  const handleRegenerate = async () => {
    const confirmed = window.confirm(
      'Are you sure? This will invalidate the current key and disconnect all remote clients.'
    );
    if (!confirmed) return;

    setRegenerating(true);
    setError(null);
    try {
      const newInfo = await regenerateApiKeyApi();
      setKeyInfo(newInfo);
      setShowFullKey(true); // Show the new key
    } catch (err) {
      console.error('Failed to regenerate API key:', err);
      setError('Failed to regenerate API key');
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-card border border-border rounded-lg">
        <div className="text-sm text-muted-foreground">Loading API key info...</div>
      </div>
    );
  }

  if (error && !keyInfo) {
    return (
      <div className="p-4 bg-card border border-border rounded-lg">
        <div className="text-sm text-destructive">{error}</div>
        <button
          onClick={loadKeyInfo}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!keyInfo) return null;

  return (
    <div className="p-4 bg-card border border-border rounded-lg">
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <span>Remote Access API Key</span>
      </h3>

      <div className="space-y-3">
        {/* Key display */}
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-secondary rounded font-mono text-xs break-all">
            {showFullKey ? keyInfo.fullKey : keyInfo.maskedKey}
          </code>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowFullKey(!showFullKey)}
            className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded"
          >
            {showFullKey ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="px-2 py-1 text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 rounded disabled:opacity-50"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}

        {/* Help text */}
        <p className="text-xs text-muted-foreground">
          Use this key to connect from other devices. The key is stored at:
        </p>
        <code className="block text-[10px] text-muted-foreground bg-secondary px-2 py-1 rounded break-all">
          {keyInfo.configPath}
        </code>
      </div>
    </div>
  );
}
