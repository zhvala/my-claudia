import { useState } from 'react';
import { useServerStore } from '../stores/serverStore';
import { ProviderManager } from './ProviderManager';
import { ThemeToggle } from './ThemeToggle';
import { ApiKeyManager } from './ApiKeyManager';
import { ServerGatewayConfig } from './ServerGatewayConfig';
import { ImportDialog } from './ImportDialog';

type SettingsTab = 'general' | 'servers' | 'import' | 'providers' | 'security' | 'gateway';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const { connectionStatus, getActiveServer, isLocalConnection } = useServerStore();

  const isConnected = connectionStatus === 'connected';
  const activeServer = getActiveServer();
  // Use backend-determined isLocalConnection (true = connecting from localhost)
  const isLocalServer = isLocalConnection === true;

  if (!isOpen) return null;

  // Build tabs based on context - Providers and Security only shown for local server
  const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    {
      id: 'servers',
      label: 'Servers',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      )
    },
    // Only show Import, Providers, Security, and Gateway tabs when connected to local server
    // These are server administration features not relevant for remote clients
    ...(isLocalServer ? [
      {
        id: 'import' as SettingsTab,
        label: 'Import',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        )
      },
      {
        id: 'providers' as SettingsTab,
        label: 'Providers',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )
      },
      {
        id: 'gateway' as SettingsTab,
        label: 'Gateway',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        )
      },
      {
        id: 'security' as SettingsTab,
        label: 'Security',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )
      }
    ] : [])
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] md:max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Tabs - horizontal on mobile, vertical sidebar on desktop */}
          <div className="flex md:flex-col md:w-40 border-b md:border-b-0 md:border-r border-border p-1 md:p-2 gap-1 overflow-x-auto md:overflow-x-visible shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {tab.icon}
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="flex-1 p-3 md:p-4 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-3">Appearance</h3>
                  <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <span className="text-sm">Theme</span>
                    </div>
                    <ThemeToggle />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-3">About</h3>
                  <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <span>0.1.0</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Connection</span>
                      <span className={isConnected ? 'text-green-500' : 'text-muted-foreground'}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    {activeServer && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Server</span>
                        <span>{activeServer.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'servers' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage your backend server connections. Use Client ID when connecting through a gateway that routes to multiple backends.
                </p>
                <ServerListManager />
              </div>
            )}

            {activeTab === 'import' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Import Data</h3>
                <p className="text-sm text-muted-foreground">
                  Import sessions from other Claude CLI installations. This feature allows you to migrate your conversation history.
                </p>

                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">Claude CLI Sessions</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Import conversation history from the official Anthropic Claude CLI. You can select which sessions to import and specify the target project.
                      </p>
                      <button
                        onClick={() => setImportDialogOpen(true)}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 text-sm"
                      >
                        Import from Claude CLI
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground p-3 bg-secondary/50 rounded-lg">
                  <strong>Note:</strong> Import functionality is only available when connected to a local server. The default Claude CLI directory is <code className="px-1 py-0.5 bg-background rounded">~/.claude</code>.
                </div>
              </div>
            )}

            {activeTab === 'providers' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage AI providers for your projects. Each provider can have different CLI paths and environment variables.
                </p>
                <ProviderManagerInline />
              </div>
            )}

            {activeTab === 'gateway' && (
              <div className="space-y-4">
                <ServerGatewayConfig />
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage authentication for remote access to this server.
                </p>
                {isLocalServer && isConnected ? (
                  <ApiKeyManager />
                ) : (
                  <div className="p-4 bg-secondary/50 border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {!isConnected
                        ? 'Connect to a server to view security settings.'
                        : 'API Key management is only available when connected to a local server.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Dialog */}
      <ImportDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />
    </div>
  );
}

// Inline version of ProviderManager for the settings panel
function ProviderManagerInline() {
  // We'll reuse the ProviderManager but render it inline
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <ProviderManager isOpen={true} onClose={() => {}} inline={true} />
    </div>
  );
}

// Server list manager for editing server settings
function ServerListManager() {
  const { servers, activeServerId } = useServerStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const startEditing = (server: typeof servers[0]) => {
    setEditingId(server.id);
    setEditClientId(server.clientId || '');
    setEditApiKey(server.apiKey || '');
  };

  const saveEditing = (_serverId: string) => {
    // TODO: Update server via WebSocket instead of direct store mutation
    // sendMessage({ type: 'update_server', id: serverId, server: { clientId, apiKey } });
    console.warn('Server update not implemented - requires WebSocket migration');
    setEditingId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditClientId('');
    setEditApiKey('');
  };

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <div
          key={server.id}
          className={`p-3 border rounded-lg ${
            server.id === activeServerId ? 'border-primary bg-primary/5' : 'border-border'
          }`}
        >
          {/* Header with name and badges */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm">{server.name}</span>
            {server.isDefault && (
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">
                Default
              </span>
            )}
            {server.id === activeServerId && (
              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-500 text-xs rounded">
                Active
              </span>
            )}
          </div>

          {/* Address */}
          <div className="text-xs text-muted-foreground mb-2">{server.address}</div>

          {editingId === server.id ? (
            /* Edit mode */
            <div className="space-y-3 mt-3 pt-3 border-t border-border">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Client ID (optional, for gateway routing)
                </label>
                <input
                  type="text"
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  placeholder="e.g., home-mac"
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                <input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  placeholder="mca_..."
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
              </div>
              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => saveEditing(server.id)}
                  className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="flex-1 px-3 py-1.5 text-sm bg-secondary rounded hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* View mode */
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-xs">
                {server.clientId && (
                  <span className="px-2 py-0.5 bg-secondary rounded">
                    ID: {server.clientId}
                  </span>
                )}
                {server.apiKey && (
                  <span className="px-2 py-0.5 bg-secondary rounded">
                    API Key: ****{server.apiKey.slice(-4)}
                  </span>
                )}
                {!server.clientId && !server.apiKey && (
                  <span className="text-muted-foreground">No authentication configured</span>
                )}
              </div>
              <button
                onClick={() => startEditing(server)}
                className="px-3 py-1 text-xs bg-secondary rounded hover:bg-muted shrink-0"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
