import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useServerStore, type ServerConnection } from '../stores/serverStore';
import { useServerManager } from '../hooks/useServerManager';
import { useConnection } from '../contexts/ConnectionContext';
import type { BackendServer, ConnectionMode } from '@my-claudia/shared';
import { verifyApiKey } from '../services/api';

// Helper to check if an address is localhost
function isLocalAddress(address: string): boolean {
  return address.startsWith('localhost') || address.startsWith('127.0.0.1');
}

type ConnectionType = 'direct' | 'gateway';

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
  // Gateway mode fields
  const [connectionType, setConnectionType] = useState<ConnectionType>('direct');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewaySecret, setGatewaySecret] = useState('');
  const [backendId, setBackendId] = useState('');
  // Proxy settings
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');

  const activeServer = servers.find((s) => s.id === activeServerId);

  const handleStartEdit = (server: BackendServer) => {
    setEditingServer(server);
    setNewServerName(server.name);
    setConnectionType(server.connectionMode || 'direct');

    if (server.connectionMode === 'gateway') {
      setGatewayUrl(server.gatewayUrl || '');
      setGatewaySecret(server.gatewaySecret || '');
      setBackendId(server.backendId || '');
      setNewApiKey(''); // Don't pre-fill for security
      // Load proxy settings
      setProxyUrl(server.proxyUrl || '');
      setProxyUsername(server.proxyAuth?.username || '');
      setProxyPassword(''); // Don't pre-fill for security
    } else {
      setNewServerAddress(server.address);
      setNewClientId(server.clientId || '');
      setNewApiKey(''); // Don't pre-fill for security
    }

    setShowAddForm(true);
  };

  const handleAddServer = async () => {
    if (!newServerName.trim()) return;

    // Validate based on connection type
    if (connectionType === 'gateway') {
      // Gateway mode validation
      if (!gatewayUrl.trim()) {
        setVerifyError('Gateway URL is required');
        return;
      }
      if (!gatewaySecret.trim() && !editingServer) {
        setVerifyError('Gateway Secret is required');
        return;
      }
      if (!backendId.trim()) {
        setVerifyError('Backend ID is required');
        return;
      }
      if (!newApiKey.trim() && !editingServer?.apiKey) {
        setVerifyError('Backend API Key is required');
        return;
      }

      const serverData: any = {
        name: newServerName.trim(),
        address: gatewayUrl.trim(),
        connectionMode: 'gateway' as ConnectionMode,
        gatewayUrl: gatewayUrl.trim(),
        gatewaySecret: gatewaySecret.trim() || editingServer?.gatewaySecret,
        backendId: backendId.trim(),
        apiKey: newApiKey.trim() || editingServer?.apiKey
      };

      // Add proxy settings if provided
      if (proxyUrl.trim()) {
        serverData.proxyUrl = proxyUrl.trim();
        if (proxyUsername.trim() || proxyPassword.trim()) {
          serverData.proxyAuth = {
            username: proxyUsername.trim() || editingServer?.proxyAuth?.username,
            password: proxyPassword.trim() || editingServer?.proxyAuth?.password
          };
        }
      }

      if (editingServer) {
        updateServer(editingServer.id, serverData);
      } else {
        addServer({ ...serverData, isDefault: servers.length === 0 });
      }
    } else {
      // Direct mode validation
      if (!newServerAddress.trim()) {
        setVerifyError('Server address is required');
        return;
      }

      const address = newServerAddress.trim();
      const needsAuth = !isLocalAddress(address);

      // Verify API key for remote servers (only when adding or changing API key)
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
        clientId: newClientId.trim() || undefined,
        connectionMode: 'direct' as ConnectionMode
      };

      if (editingServer) {
        updateServer(editingServer.id, serverData);
      } else {
        addServer({ ...serverData, isDefault: servers.length === 0 });
      }
    }

    // Reset form
    setEditingServer(null);
    setNewServerName('');
    setNewServerAddress('');
    setNewApiKey('');
    setNewClientId('');
    setGatewayUrl('');
    setGatewaySecret('');
    setBackendId('');
    setProxyUrl('');
    setProxyUsername('');
    setProxyPassword('');
    setConnectionType('direct');
    setVerifyError(null);
    setShowAddForm(false);
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
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
        <div className="absolute top-full left-0 mt-1 w-[calc(100vw-1rem)] md:w-72 max-w-72 bg-card border border-border rounded-lg shadow-xl z-50">
          {/* Status */}
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-muted-foreground" data-testid="connection-status">{getStatusText()}</span>
            </div>
          </div>

          {/* Server List - with max-height for scrolling */}
          <div className="max-h-60 overflow-y-auto">
            {servers.map((server) => (
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
                canDelete={servers.length > 1}
              />
            ))}
          </div>

          {/* Add Server */}
          <div className="border-t border-border p-2 bg-card">
            {showAddForm ? (
              <div className="space-y-2">
                {/* Connection Type Toggle */}
                <div className="flex gap-1 p-0.5 bg-muted rounded">
                  <button
                    onClick={() => setConnectionType('direct')}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      connectionType === 'direct'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Direct
                  </button>
                  <button
                    onClick={() => setConnectionType('gateway')}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      connectionType === 'gateway'
                        ? 'bg-background shadow text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Gateway
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Server name"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                />

                {connectionType === 'direct' ? (
                  <>
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
                    {/* Show Client ID and API Key input for non-localhost addresses */}
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
                  </>
                ) : (
                  <>
                    {/* Gateway mode fields */}
                    <input
                      type="text"
                      placeholder="Gateway URL (e.g., https://gateway.example.com)"
                      value={gatewayUrl}
                      onChange={(e) => {
                        setGatewayUrl(e.target.value);
                        setVerifyError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="password"
                      placeholder={editingServer ? "Gateway Secret (leave blank to keep)" : "Gateway Secret"}
                      value={gatewaySecret}
                      onChange={(e) => {
                        setGatewaySecret(e.target.value);
                        setVerifyError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      placeholder="Backend ID (from Gateway)"
                      value={backendId}
                      onChange={(e) => {
                        setBackendId(e.target.value);
                        setVerifyError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                    />
                    <input
                      type="password"
                      placeholder={editingServer ? "Backend API Key (leave blank to keep)" : "Backend API Key"}
                      value={newApiKey}
                      onChange={(e) => {
                        setNewApiKey(e.target.value);
                        setVerifyError(null);
                      }}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary"
                    />

                    {/* Proxy Settings */}
                    <div className="pt-2 border-t border-border">
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        SOCKS5 Proxy (Optional)
                      </div>
                      <input
                        type="text"
                        placeholder="Proxy URL (e.g., socks5://127.0.0.1:1080)"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary mb-2"
                      />
                      {proxyUrl.trim() && (
                        <>
                          <input
                            type="text"
                            placeholder="Proxy Username (optional)"
                            value={proxyUsername}
                            onChange={(e) => setProxyUsername(e.target.value)}
                            className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary mb-2"
                          />
                          <input
                            type="password"
                            placeholder={editingServer?.proxyAuth ? "Proxy Password (leave blank to keep)" : "Proxy Password (optional)"}
                            value={proxyPassword}
                            onChange={(e) => setProxyPassword(e.target.value)}
                            className="w-full px-2 py-1.5 bg-input border border-border rounded text-sm focus:outline-none focus:border-primary mb-2"
                          />
                          <div className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded">
                            ⚠️ Proxy settings saved but browser WebSocket doesn't support SOCKS5 directly. Please configure system-level proxy for now.
                          </div>
                        </>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Connect to a remote backend through Gateway
                    </div>
                  </>
                )}

                {/* Show verification error */}
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
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingServer(null);
                      setNewServerName('');
                      setNewServerAddress('');
                      setNewApiKey('');
                      setNewClientId('');
                      setGatewayUrl('');
                      setGatewaySecret('');
                      setBackendId('');
                      setProxyUrl('');
                      setProxyUsername('');
                      setProxyPassword('');
                      setConnectionType('direct');
                      setVerifyError(null);
                    }}
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
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Server
              </button>
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

  // Calculate menu position when showing
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.top - 8, // Position above the button
        left: rect.right - 144 // 144px = w-36 (9rem)
      });
    }
  }, [showMenu]);

  // Get connection status color
  const getConnectionStatusColor = () => {
    switch (connection?.status) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const isConnected = connection?.status === 'connected';
  const isConnecting = connection?.status === 'connecting';

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 hover:bg-muted cursor-pointer ${
        isActive ? 'bg-muted' : ''
      }`}
    >
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="flex items-center gap-2">
          {/* Per-server connection status indicator */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getConnectionStatusColor()}`} title={connection?.status || 'disconnected'} />
          <span className="text-sm font-medium truncate">{server.name}</span>
          {server.isDefault && (
            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">
              Default
            </span>
          )}
          {server.connectionMode === 'gateway' && (
            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-500 text-xs rounded" title="Via Gateway">
              🌐
            </span>
          )}
          {server.requiresAuth && (
            <span className="text-muted-foreground" title="Requires authentication">
              🔐
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {server.connectionMode === 'gateway' ? (
            <>
              {server.backendId}
              <span className="ml-1 text-blue-500/70">via {(() => { try { return new URL(server.gatewayUrl || 'http://unknown').host; } catch { return server.gatewayUrl || 'unknown'; } })()}</span>
            </>
          ) : (
            <>
              {server.address}
              {server.clientId && (
                <span className="ml-1 text-primary/70">({server.clientId})</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Connect/Disconnect button */}
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
        className={`px-2 py-0.5 text-xs rounded mr-1 transition-colors ${
          isConnected
            ? 'bg-green-500/20 text-green-600 hover:bg-green-500/30 dark:text-green-400'
            : isConnecting
            ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 cursor-wait'
            : 'bg-gray-500/20 text-gray-600 hover:bg-gray-500/30 dark:text-gray-400'
        }`}
        title={isConnected ? 'Disconnect from server' : isConnecting ? 'Connecting...' : 'Connect to server'}
      >
        {isConnected ? '断开' : isConnecting ? '连接中' : '连接'}
      </button>

      {/* Menu */}
      <div className="relative">
        <button
          ref={menuButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-secondary"
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
              {canDelete && (
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
    </div>
  );
}
