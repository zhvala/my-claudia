import { useState, useEffect } from 'react';
import {
  getServerGatewayConfig,
  updateServerGatewayConfig,
  getServerGatewayStatus,
  connectServerToGateway,
  disconnectServerFromGateway
} from '../services/api';
import type { ServerGatewayConfig as GatewayConfig, ServerGatewayStatus } from '@my-claudia/shared';

export function ServerGatewayConfig() {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [status, setStatus] = useState<ServerGatewayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewaySecret, setGatewaySecret] = useState('');
  const [backendName, setBackendName] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Poll status every 5 seconds when enabled
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const [configData, statusData] = await Promise.all([
        getServerGatewayConfig(),
        getServerGatewayStatus()
      ]);

      setConfig(configData);
      setStatus(statusData);

      // Update form state
      setEnabled(configData.enabled);
      setGatewayUrl(configData.gatewayUrl || '');
      setBackendName(configData.backendName || '');
      setProxyUrl(configData.proxyUrl || '');
      setProxyUsername(configData.proxyUsername || '');
      // Don't set secrets from API (they're masked)

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const statusData = await getServerGatewayStatus();
      setStatus(statusData);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const updates: any = {
        enabled,
        gatewayUrl: gatewayUrl.trim(),
        backendName: backendName.trim()
      };

      // Only include secret if it's been changed
      if (gatewaySecret.trim() && gatewaySecret !== '********') {
        updates.gatewaySecret = gatewaySecret.trim();
      }

      // Add proxy settings if provided
      if (proxyUrl.trim()) {
        updates.proxyUrl = proxyUrl.trim();
        if (proxyUsername.trim()) {
          updates.proxyUsername = proxyUsername.trim();
        }
        if (proxyPassword.trim() && proxyPassword !== '********') {
          updates.proxyPassword = proxyPassword.trim();
        }
      } else {
        // Clear proxy settings if URL is empty
        updates.proxyUrl = null;
        updates.proxyUsername = null;
        updates.proxyPassword = null;
      }

      const updated = await updateServerGatewayConfig(updates);
      setConfig(updated);

      // Reload status after save
      await loadStatus();

      alert('Gateway configuration saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    try {
      setSaving(true);
      setError(null);
      await connectServerToGateway();
      await loadStatus();
      alert('Connecting to gateway...');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setSaving(true);
      setError(null);
      await disconnectServerFromGateway();
      await loadStatus();
      alert('Disconnected from gateway');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
          Server Gateway Configuration
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Connect your backend server to a Gateway to enable remote access from mobile devices.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Status Display */}
      {status && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
            <span
              className={`text-sm px-2 py-1 rounded ${
                status.connected
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : status.enabled
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
              }`}
            >
              {status.connected ? 'Connected' : status.enabled ? 'Connecting...' : 'Disabled'}
            </span>
          </div>
          {status.backendId && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Backend ID:</span>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{status.backendId}</span>
            </div>
          )}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Enable Gateway Connection
        </label>
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Configuration Fields */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Gateway URL
          </label>
          <input
            type="text"
            value={gatewayUrl}
            onChange={(e) => setGatewayUrl(e.target.value)}
            placeholder="http://gateway.example.com:3200"
            disabled={!enabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Gateway Secret
          </label>
          <input
            type="password"
            value={gatewaySecret}
            onChange={(e) => setGatewaySecret(e.target.value)}
            placeholder={config?.gatewaySecret ? '********' : 'Enter gateway secret'}
            disabled={!enabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Leave blank to keep existing secret
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Backend Name
          </label>
          <input
            type="text"
            value={backendName}
            onChange={(e) => setBackendName(e.target.value)}
            placeholder="My Mac"
            disabled={!enabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Optional display name for this backend
          </p>
        </div>

        {/* Proxy Settings */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            SOCKS5 Proxy (Optional)
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Proxy URL
              </label>
              <input
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="socks5://127.0.0.1:1080"
                disabled={!enabled}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         placeholder-gray-400 dark:placeholder-gray-500
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                SOCKS5 proxy for connecting to Gateway
              </p>
            </div>

            {proxyUrl.trim() && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proxy Username
                  </label>
                  <input
                    type="text"
                    value={proxyUsername}
                    onChange={(e) => setProxyUsername(e.target.value)}
                    placeholder="Optional"
                    disabled={!enabled}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             placeholder-gray-400 dark:placeholder-gray-500
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proxy Password
                  </label>
                  <input
                    type="password"
                    value={proxyPassword}
                    onChange={(e) => setProxyPassword(e.target.value)}
                    placeholder={config?.proxyPassword ? '********' : 'Optional'}
                    disabled={!enabled}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             placeholder-gray-400 dark:placeholder-gray-500
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave blank to keep existing password
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                   font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>

        {enabled && status?.connected && (
          <button
            onClick={handleDisconnect}
            disabled={saving}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg
                     font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        )}

        {enabled && !status?.connected && (
          <button
            onClick={handleConnect}
            disabled={saving || !gatewayUrl || !config?.gatewaySecret}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg
                     font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
