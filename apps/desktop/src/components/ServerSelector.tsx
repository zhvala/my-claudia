import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useServerStore, type ServerConnection } from '../stores/serverStore';
import { useGatewayStore, toGatewayServerId, type BackendAuthStatus } from '../stores/gatewayStore';
import { useServerManager } from '../hooks/useServerManager';
import { useConnection } from '../contexts/ConnectionContext';
import type { BackendServer, GatewayBackendInfo } from '@my-claudia/shared';
import { verifyApiKey } from '../services/api';

// Helper to check if an address is localhost
function isLocalAddress(address: string): boolean {
  return address.startsWith('localhost') || address.startsWith('127.0.0.1');
}

export function ServerSelector() {
  const {
    servers,
    activeServerId,
    connections,
    connectionStatus,
    connectionError,
    setActiveServer
  } = useServerStore();

  const {
    gatewayUrl,
    gatewaySecret,
    isConnected: isGatewayConnected,
    discoveredBackends,
    backendAuthStatus,
    backendApiKeys,
    setGatewayConfig,
    setBackendApiKey,
    clearGateway
  } = useGatewayStore();

  const {
    addServer,
    updateServer,
    deleteServer,
    setDefaultServer
  } = useServerManager();

  const {
    connectServer,
    disconnectServer
  } = useConnection();

  const [isOpen, setIsOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState<BackendServer | null>(null);
  const [newServerName, setNewServerName] = useState('');
  const [newServerAddress, setNewServerAddress] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Gateway config form
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [gwUrl, setGwUrl] = useState('');
  const [gwSecret, setGwSecret] = useState('');

  // Backend API key prompt
  const [apiKeyPromptBackend, setApiKeyPromptBackend] = useState<GatewayBackendInfo | null>(null);
  const [backendApiKeyInput, setBackendApiKeyInput] = useState('');

  // Filter out legacy gateway-mode servers
  const directServers = servers.filter(s => s.connectionMode !== 'gateway');

  const activeServer = useServerStore.getState().getActiveServer();
  const isGatewayConfigured = !!gatewayUrl && !!gatewaySecret;

  const handleStartEdit = (server: BackendServer) => {
    setEditingServer(server);
    setNewServerName(server.name);
    setNewServerAddress(server.address);
    setNewClientId(server.clientId || '');
    setNewApiKey('');
    setShowAddForm(true);
  };

  const handleAddServer = async () => {
    if (!newServerName.trim() || !newServerAddress.trim()) {
      setVerifyError('Name and address are required');
      return;
    }

    const address = newServerAddress.trim();
    const needsAuth = !isLocalAddress(address);

    // Verify API key for remote servers
    if (needsAuth && newApiKey.trim()) {
      setIsVerifying(true);
      setVerifyError(null);

      try {
        const valid = await verifyApiKey(address, newApiKey.trim());
        if (!valid) {
          setVerifyError('Invalid API Key');
          setIsVerifying(false);
          return;
        }
      } catch {
        setVerifyError('Failed to connect to server');
        setIsVerifying(false);
        return;
      }

      setIsVerifying(false);
    }

    const serverData = {
      name: newServerName.trim(),
      address,
      apiKey: newApiKey.trim() || editingServer?.apiKey,
      clientId: newClientId.trim() || undefined
    };

    if (editingServer) {
      updateServer(editingServer.id, serverData);
    } else {
      addServer({ ...serverData, isDefault: directServers.length === 0 });
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingServer(null);
    setNewServerName('');
    setNewServerAddress('');
    setNewApiKey('');
    setNewClientId('');
    setVerifyError(null);
    setShowAddForm(false);
  };

  const handleSaveGateway = () => {
    if (!gwUrl.trim()) return;
    // When editing, keep old secret if new one is blank
    const newSecret = gwSecret.trim() || gatewaySecret || '';
    if (!newSecret) return;
    setGatewayConfig(gwUrl.trim(), newSecret);
    setShowGatewayForm(false);
    setGwUrl('');
    setGwSecret('');
  };

  const handleEditGateway = () => {
    setGwUrl(gatewayUrl || '');
    setGwSecret('');
    setShowGatewayForm(true);
  };

  const handleRemoveGateway = () => {
    // Switch away from gateway backend if active
    if (activeServerId?.startsWith('gw:')) {
      const defaultServer = directServers.find(s => s.isDefault) || directServers[0];
      if (defaultServer) {
        setActiveServer(defaultServer.id);
      }
    }
    clearGateway();
    setShowGatewayForm(false);
  };

  const handleBackendClick = (backend: GatewayBackendInfo) => {
    if (!backend.online) return;

    const apiKey = backendApiKeys[backend.backendId];
    if (apiKey) {
      // Has stored API key -- switch to this backend
      const serverId = toGatewayServerId(backend.backendId);
      setActiveServer(serverId);
      connectServer(serverId);
      setIsOpen(false);
    } else {
      // No API key -- prompt for it
      setApiKeyPromptBackend(backend);
      setBackendApiKeyInput('');
    }
  };

  const handleSaveBackendApiKey = () => {
    if (!apiKeyPromptBackend || !backendApiKeyInput.trim()) return;

    setBackendApiKey(apiKeyPromptBackend.backendId, backendApiKeyInput.trim());

    // Connect to this backend
    const serverId = toGatewayServerId(apiKeyPromptBackend.backendId);
    setActiveServer(serverId);
    connectServer(serverId);

    setApiKeyPromptBackend(null);
    setBackendApiKeyInput('');
    setIsOpen(false);
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-warning animate-pulse';
      case 'error':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return connectionError || 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="relative">
      {/* Current Server Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors"
        data-testid="server-selector"
      >
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-sm truncate max-w-[150px]">
          {activeServer?.name || 'No Server'}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-2 top-14 md:absolute md:inset-x-auto md:top-full md:left-0 mt-1 md:w-80 bg-card border border-border rounded-lg shadow-xl z-50">
          {/* Status */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-muted-foreground" data-testid="connection-status">{getStatusText()}</span>
            </div>
          </div>

          {/* Server List (direct servers only) */}
          <div className="max-h-40 overflow-y-auto">
            {directServers.map((server) => (
              <ServerItem
                key={server.id}
                server={server}
                isActive={server.id === activeServerId}
                connection={connections[server.id]}
                onSelect={() => {
                  setActiveServer(server.id);
                  setIsOpen(false);
                }}
                onEdit={() => handleStartEdit(server)}
                onSetDefault={() => setDefaultServer(server.id)}
                onDelete={() => deleteServer(server.id)}
                onConnect={() => connectServer(server.id)}
                onDisconnect={() => disconnectServer(server.id)}
                canDelete={directServers.length > 1}
              />
            ))}
          </div>

          {/* Add Direct Server */}
          <div className="border-t border-border p-2 bg-card">
            {showAddForm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Server name"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="Address (e.g., 192.168.1.100:3100)"
                  value={newServerAddress}
                  onChange={(e) => {
                    setNewServerAddress(e.target.value);
                    setVerifyError(null);
                  }}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
                {newServerAddress && !isLocalAddress(newServerAddress) && (
                  <>
                    <input
                      type="text"
                      placeholder="Client ID (optional)"
                      value={newClientId}
                      onChange={(e) => setNewClientId(e.target.value)}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="password"
                      placeholder={editingServer ? "API Key (leave blank to keep)" : "API Key"}
                      value={newApiKey}
                      onChange={(e) => {
                        setNewApiKey(e.target.value);
                        setVerifyError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                      data-testid="api-key-input"
                    />
                  </>
                )}
                {verifyError && (
                  <div className="text-xs text-destructive">{verifyError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleAddServer}
                    disabled={isVerifying}
                    className="flex-1 px-2 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm disabled:opacity-50"
                    data-testid="save-server-btn"
                  >
                    {isVerifying ? 'Verifying...' : (editingServer ? 'Save' : 'Add')}
                  </button>
                  <button
                    onClick={resetForm}
                    className="flex-1 px-2 py-1.5 bg-secondary hover:bg-muted rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full text-left px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Server
              </button>
            )}
          </div>

          {/* Gateway Section */}
          <div className="border-t border-border">
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-secondary/50 flex items-center justify-between">
              <span>Gateway</span>
              {isGatewayConfigured && (
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isGatewayConnected ? 'bg-success' : 'bg-destructive'}`} />
                  <span className="text-[10px] normal-case font-normal">
                    {isGatewayConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              )}
            </div>

            {showGatewayForm ? (
              /* Gateway config form */
              <div className="p-2 space-y-2">
                <input
                  type="text"
                  placeholder="Gateway URL (e.g., 192.168.2.1:3200)"
                  value={gwUrl}
                  onChange={(e) => setGwUrl(e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
                <input
                  type="password"
                  placeholder={isGatewayConfigured ? "Gateway Secret (leave blank to keep)" : "Gateway Secret"}
                  value={gwSecret}
                  onChange={(e) => setGwSecret(e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveGateway}
                    className="flex-1 px-2 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm"
                  >
                    {isGatewayConfigured ? 'Update' : 'Connect'}
                  </button>
                  <button
                    onClick={() => {
                      setShowGatewayForm(false);
                      setGwUrl('');
                      setGwSecret('');
                    }}
                    className="flex-1 px-2 py-1.5 bg-secondary hover:bg-muted rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
                {isGatewayConfigured && (
                  <button
                    onClick={handleRemoveGateway}
                    className="w-full px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
                  >
                    Remove Gateway
                  </button>
                )}
              </div>
            ) : apiKeyPromptBackend ? (
              /* Backend API key prompt */
              <div className="p-2 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Enter API key for <span className="font-medium text-foreground">{apiKeyPromptBackend.name}</span>
                </div>
                <input
                  type="password"
                  placeholder="Backend API Key"
                  value={backendApiKeyInput}
                  onChange={(e) => setBackendApiKeyInput(e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveBackendApiKey()}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveBackendApiKey}
                    disabled={!backendApiKeyInput.trim()}
                    className="flex-1 px-2 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-sm disabled:opacity-50"
                  >
                    Connect
                  </button>
                  <button
                    onClick={() => {
                      setApiKeyPromptBackend(null);
                      setBackendApiKeyInput('');
                    }}
                    className="flex-1 px-2 py-1.5 bg-secondary hover:bg-muted rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : !isGatewayConfigured ? (
              /* Not configured */
              <div className="p-2">
                <button
                  onClick={() => setShowGatewayForm(true)}
                  className="w-full text-left px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  Connect to Gateway
                </button>
              </div>
            ) : (
              /* Connected -- show backends */
              <div>
                {/* Gateway info + edit */}
                <div className="px-3 py-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{gatewayUrl}</span>
                  <button
                    onClick={handleEditGateway}
                    className="text-xs text-primary hover:text-primary/80 flex-shrink-0 ml-2"
                  >
                    Edit
                  </button>
                </div>

                {/* Backend list */}
                {isGatewayConnected && discoveredBackends.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto">
                    {discoveredBackends.map((backend) => (
                      <GatewayBackendItem
                        key={backend.backendId}
                        backend={backend}
                        isActive={activeServerId === toGatewayServerId(backend.backendId)}
                        authStatus={backendAuthStatus[backend.backendId]}
                        hasApiKey={!!backendApiKeys[backend.backendId]}
                        onClick={() => handleBackendClick(backend)}
                      />
                    ))}
                  </div>
                ) : isGatewayConnected ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    No backends available
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    Connecting to gateway...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

function GatewayBackendItem({
  backend,
  isActive,
  authStatus,
  hasApiKey,
  onClick
}: {
  backend: GatewayBackendInfo;
  isActive: boolean;
  authStatus?: BackendAuthStatus;
  hasApiKey: boolean;
  onClick: () => void;
}) {
  const statusColor = backend.online
    ? authStatus === 'authenticated' ? 'bg-success' : 'bg-blue-400'
    : 'bg-muted-foreground';

  return (
    <div
      className={`px-3 py-2 hover:bg-muted cursor-pointer ${isActive ? 'bg-muted' : ''} ${!backend.online ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <span className="text-sm truncate flex-1 min-w-0">{backend.name}</span>
        {isActive && (
          <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded flex-shrink-0">
            Active
          </span>
        )}
        {!backend.online && (
          <span className="text-xs text-muted-foreground flex-shrink-0">Offline</span>
        )}
        {backend.online && !hasApiKey && (
          <span className="text-xs text-muted-foreground flex-shrink-0">No key</span>
        )}
        {backend.online && hasApiKey && authStatus === 'authenticated' && (
          <span className="text-xs text-success flex-shrink-0">Connected</span>
        )}
        {backend.online && hasApiKey && authStatus === 'pending' && (
          <span className="text-xs text-warning flex-shrink-0 animate-pulse">Connecting</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate ml-4 mt-0.5">
        {backend.backendId}
      </div>
    </div>
  );
}

function ServerItem({
  server,
  isActive,
  connection,
  onSelect,
  onEdit,
  onSetDefault,
  onDelete,
  onConnect,
  onDisconnect,
  canDelete
}: {
  server: BackendServer;
  isActive: boolean;
  connection?: ServerConnection;
  onSelect: () => void;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  canDelete: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top - 8,
        left: rect.right - 144
      });
    }
  }, [showMenu]);

  const getConnectionStatusColor = () => {
    switch (connection?.status) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-warning animate-pulse';
      case 'error':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground';
    }
  };

  const isConnected = connection?.status === 'connected';
  const isConnecting = connection?.status === 'connecting';

  return (
    <div
      className={`px-3 py-2 hover:bg-muted cursor-pointer ${
        isActive ? 'bg-muted' : ''
      }`}
    >
      <div className="flex items-center gap-2" onClick={onSelect}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getConnectionStatusColor()}`} title={connection?.status || 'disconnected'} />
        <span className="text-sm font-medium truncate flex-1 min-w-0">{server.name}</span>
        {server.isDefault && (
          <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded flex-shrink-0">
            Default
          </span>
        )}
        {/* Connect/Disconnect button */}
        {server.id === 'local' ? (
          isConnected ? (
            <span className="px-2 py-0.5 text-xs rounded flex-shrink-0 bg-success/20 text-success">
              Connected
            </span>
          ) : isConnecting ? (
            <span className="px-2 py-0.5 text-xs rounded flex-shrink-0 bg-warning/20 text-warning animate-pulse">
              Connecting
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConnect();
              }}
              className="px-2 py-0.5 text-xs rounded flex-shrink-0 bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              title="Connect to server"
            >
              Connect
            </button>
          )
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isConnected) {
                onDisconnect();
              } else if (!isConnecting) {
                onConnect();
              }
            }}
            disabled={isConnecting}
            className={`px-2 py-0.5 text-xs rounded flex-shrink-0 transition-colors ${
              isConnected
                ? 'bg-success/20 text-success hover:bg-success/30'
                : isConnecting
                ? 'bg-warning/20 text-warning cursor-wait'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            title={isConnected ? 'Disconnect from server' : isConnecting ? 'Connecting...' : 'Connect to server'}
          >
            {isConnected ? 'Disconnect' : isConnecting ? 'Connecting' : 'Connect'}
          </button>
        )}
        {/* Menu */}
        <button
          ref={menuButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-secondary flex-shrink-0"
          data-testid="server-menu-btn"
        >
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>

      {/* Address details */}
      <div className="text-xs text-muted-foreground truncate ml-4 mt-0.5" onClick={onSelect}>
        {server.address}
        {server.clientId && (
          <span className="ml-1 text-primary/70">({server.clientId})</span>
        )}
      </div>

      {showMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="fixed w-36 bg-card border border-border rounded shadow-lg z-[60]"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              transform: 'translateY(-100%)'
            }}
          >
            <button
              onClick={() => {
                onEdit();
                setShowMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
              data-testid="edit-server-btn"
            >
              Edit
            </button>
            {!server.isDefault && (
              <button
                onClick={() => {
                  onSetDefault();
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
              >
                Set as Default
              </button>
            )}
            {canDelete && server.id !== 'local' && (
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-muted"
              >
                Delete
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
