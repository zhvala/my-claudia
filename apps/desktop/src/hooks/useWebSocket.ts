import { useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage, AuthMessage } from '@my-claudia/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useServerStore } from '../stores/serverStore';
import { usePermissionStore } from '../stores/permissionStore';
import { getApiKeyInfo } from '../services/api';

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Helper to check if an address looks like localhost
function isLocalAddress(address: string): boolean {
  return address.startsWith('localhost') || address.startsWith('127.0.0.1');
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentServerIdRef = useRef<string | null>(null);
  // Use ref to avoid stale closure in WebSocket callback
  const selectedSessionIdRef = useRef<string | null>(null);

  const {
    addMessage,
    appendToLastMessage,
    setLoading,
    setCurrentRunId,
    addToolCall,
    updateToolCallResult,
    clearToolCalls,
    finalizeToolCallsToMessage,
    setSystemInfo,
    clearSystemInfo
  } = useChatStore();
  const { selectedSessionId, setProjects, setSessions } = useProjectStore();
  const {
    activeServerId,
    getActiveServer,
    setConnectionStatus,
    setIsLocalConnection,
    updateLastConnected,
    setApiKey
  } = useServerStore();

  const { setPendingRequest } = usePermissionStore();

  // Keep ref in sync with state
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  const getWsUrl = useCallback(() => {
    const server = getActiveServer();
    if (!server) return null;
    // Support both with and without protocol
    const address = server.address.includes('://')
      ? server.address.replace(/^http/, 'ws')
      : `ws://${server.address}`;

    let wsUrl = `${address}/ws`;

    // If clientId is set, add it as a URL parameter for gateway routing
    if (server.clientId) {
      wsUrl += `?clientId=${encodeURIComponent(server.clientId)}`;
    }

    return wsUrl;
  }, [getActiveServer]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        // Use ref to get current session ID (avoids stale closure)
        const currentSessionId = selectedSessionIdRef.current;

        switch (message.type) {
          case 'auth_result':
            // Authentication result from remote server
            if (message.success) {
              console.log('Authentication successful, isLocalConnection:', message.isLocalConnection);
              setConnectionStatus('connected');
              reconnectAttemptsRef.current = 0;
              if (activeServerId) {
                updateLastConnected(activeServerId);

                // If this is a local connection with an API key, persist it to database
                const currentServer = getActiveServer();
                if (message.isLocalConnection && currentServer?.apiKey) {
                  console.log('[useWebSocket] Persisting API key to database');
                  // Send update message to save API key in database
                  setTimeout(() => {
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({
                        type: 'update_server',
                        id: activeServerId,
                        server: { apiKey: currentServer.apiKey }
                      }));
                    }
                  }, 500); // Small delay to ensure connection is stable
                }
              }
              // Set isLocalConnection from auth response (backend determines this based on IP)
              setIsLocalConnection(message.isLocalConnection ?? false);
              console.log('[useWebSocket] Set isLocalConnection to:', message.isLocalConnection ?? false);
            } else {
              console.error('Authentication failed:', message.error);
              setConnectionStatus('error', message.error || 'Authentication failed');
              // Don't reconnect on auth failure
              reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
            }
            break;

          case 'pong':
            // Heartbeat response, connection is alive
            break;

          case 'run_started':
            setLoading(true);
            setCurrentRunId(message.runId);
            clearToolCalls(); // Clear any previous tool calls
            clearSystemInfo(); // Clear previous system info
            // Add empty assistant message that will be streamed into
            if (currentSessionId) {
              addMessage(currentSessionId, {
                id: message.runId,
                sessionId: currentSessionId,
                role: 'assistant',
                content: '',
                createdAt: Date.now(),
              });
            }
            break;

          case 'system_info':
            // Store system info for display
            setSystemInfo(message.systemInfo);
            break;

          case 'delta':
            if (currentSessionId) {
              appendToLastMessage(currentSessionId, message.content);
            }
            break;

          case 'tool_use':
            // Claude is calling a tool
            addToolCall(message.toolUseId, message.toolName, message.toolInput);
            break;

          case 'tool_result':
            // Tool execution completed
            updateToolCallResult(message.toolUseId, message.result, message.isError);
            break;

          case 'run_completed':
            setLoading(false);
            setCurrentRunId(null);
            // Attach tool calls to the message before clearing
            if (currentSessionId) {
              finalizeToolCallsToMessage(currentSessionId);
            }
            break;

          case 'run_failed':
            setLoading(false);
            setCurrentRunId(null);
            // Attach tool calls to the message even on failure
            if (currentSessionId) {
              finalizeToolCallsToMessage(currentSessionId);
            }
            console.error('Run failed:', message.error);
            break;

          case 'session_created':
            console.log('Session created:', message.sessionId);
            break;

          case 'permission_request':
            // Show permission modal
            setPendingRequest({
              requestId: message.requestId,
              toolName: message.toolName,
              detail: message.detail,
              timeoutSec: message.timeoutSeconds
            });
            break;

          case 'error':
            console.error('Server error:', message.code, message.message);
            break;

          case 'projects_list':
            setProjects(message.projects);
            break;

          case 'sessions_list':
            setSessions(message.sessions);
            break;

          case 'servers_list':
            useServerStore.getState().setServers(message.servers);
            break;

          case 'server_operation_result':
            // Server operations trigger automatic server list refresh from backend
            if (!message.success && message.error) {
              console.error(`Server ${message.operation} failed:`, message.error);
            }
            break;

          case 'session_messages':
            // Update chat store with session messages
            useChatStore.getState().setMessages(
              message.sessionId,
              message.messages,
              { hasMore: message.hasMore, total: message.messages.length }
            );
            break;

          case 'provider_commands':
            // Commands received from provider
            console.log('Provider commands received:', message.commands.length, 'for provider:', message.providerId);
            useProjectStore.getState().setProviderCommands(message.providerId, message.commands);
            break;

          case 'session_operation_result':
            // Session operations trigger automatic session list refresh from backend
            if (!message.success && message.error) {
              console.error(`Session ${message.operation} failed:`, message.error);
            }
            break;

          case 'project_operation_result':
            // Project operations trigger automatic project list refresh from backend
            if (!message.success && message.error) {
              console.error(`Project ${message.operation} failed:`, message.error);
            }
            break;

          case 'providers_list':
            // Providers list received
            // TODO: Add provider store when needed
            console.log('Providers list received:', message.providers.length);
            break;

          case 'provider_operation_result':
            // Provider operations trigger automatic provider list refresh from backend
            if (!message.success && message.error) {
              console.error(`Provider ${message.operation} failed:`, message.error);
            }
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
    [addMessage, appendToLastMessage, setLoading, setCurrentRunId, setPendingRequest, addToolCall, updateToolCallResult, clearToolCalls, finalizeToolCallsToMessage, setSystemInfo, clearSystemInfo, activeServerId, updateLastConnected, getActiveServer, setIsLocalConnection, setConnectionStatus, setProjects, setSessions]
  );

  const connect = useCallback(async () => {
    const wsUrl = getWsUrl();
    let server = getActiveServer();
    if (!wsUrl || !server) {
      console.error('No server configured');
      setConnectionStatus('error', 'No server configured');
      return;
    }

    // Don't connect if this is a gateway connection
    // Note: connectionMode defaults to 'direct' if not specified
    if (server.connectionMode === 'gateway') {
      console.log('[WebSocket] Skipping direct connection - server uses gateway mode');
      return;
    }
    console.log('[WebSocket] Proceeding with direct connection');

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Check if we're already connected to the right server
      if (currentServerIdRef.current === activeServerId) {
        return;
      }
      // Disconnect from current server
      wsRef.current.close();
    }

    setConnectionStatus('connecting');
    currentServerIdRef.current = activeServerId;

    // For localhost connections without API Key, try to fetch it automatically
    if (isLocalAddress(server.address) && !server.apiKey) {
      console.log('Localhost connection without API Key, fetching automatically...');
      try {
        const keyInfo = await getApiKeyInfo();
        if (keyInfo.fullKey && activeServerId) {
          setApiKey(activeServerId, keyInfo.fullKey);
          // Refresh server reference after updating API key
          server = getActiveServer()!;
          console.log('API Key fetched and stored successfully');
        }
      } catch (err) {
        console.error('Failed to fetch API Key for localhost:', err);
        setConnectionStatus('error', 'Failed to fetch API Key. Is the server running?');
        return;
      }
    }

    // All connections require API Key authentication
    if (!server.apiKey) {
      console.error('No API Key configured for server');
      setConnectionStatus('error', 'API Key required');
      return;
    }

    try {
      console.log('Connecting to:', wsUrl, '(with API Key authentication)');
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected to:', wsUrl);

        // Send authentication message
        console.log('Sending authentication...');
        const authMessage: AuthMessage = {
          type: 'auth',
          apiKey: server.apiKey!
        };
        ws.send(JSON.stringify(authMessage));
        // Don't set connected yet - wait for auth_result
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Only reconnect if we're still trying to connect to the same server
        if (currentServerIdRef.current === activeServerId) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            console.log(
              `Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
            );
            reconnectTimeoutRef.current = window.setTimeout(
              connect,
              RECONNECT_INTERVAL
            );
          } else {
            setConnectionStatus('error', 'Max reconnection attempts reached');
          }
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error', 'Connection error');
      };

      ws.onmessage = handleMessage;

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnectionStatus('error', error instanceof Error ? error.message : 'Connection failed');
    }
  }, [getWsUrl, activeServerId, getActiveServer, handleMessage, setConnectionStatus, setIsLocalConnection, updateLastConnected, setApiKey]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    currentServerIdRef.current = null;
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[useWebSocket] Sending message:', message.type);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[useWebSocket] WebSocket is not connected, readyState:', wsRef.current?.readyState, 'message type:', message.type);
    }
  }, []);

  // Store connect/disconnect in refs to avoid dependency issues
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  const getActiveServerRef = useRef(getActiveServer);

  useEffect(() => {
    connectRef.current = connect;
    disconnectRef.current = disconnect;
    getActiveServerRef.current = getActiveServer;
  }, [connect, disconnect, getActiveServer]);

  // Reconnect when active server changes
  useEffect(() => {
    const server = getActiveServerRef.current();
    console.log('[WebSocket Hook] useEffect triggered:', {
      activeServerId,
      connectionMode: server?.connectionMode,
      currentServerId: currentServerIdRef.current,
      shouldConnect: activeServerId && currentServerIdRef.current !== activeServerId && server?.connectionMode !== 'gateway'
    });

    // If switching servers or mode changed, disconnect first
    if (currentServerIdRef.current !== null && currentServerIdRef.current !== activeServerId) {
      console.log('[WebSocket Hook] Server changed, disconnecting old connection');
      disconnectRef.current();
    }

    // Only connect if this is a direct connection (not gateway)
    if (activeServerId &&
        currentServerIdRef.current !== activeServerId &&
        server?.connectionMode !== 'gateway') {
      console.log('[WebSocket Hook] Triggering connect...');
      reconnectAttemptsRef.current = 0;
      connectRef.current();
    }
  }, [activeServerId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ping to keep connection alive
  useEffect(() => {
    const { connectionStatus } = useServerStore.getState();
    if (connectionStatus !== 'connected') return;

    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 25000);

    return () => clearInterval(pingInterval);
  }, [sendMessage]);

  const { connectionStatus } = useServerStore();

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    connect,
    disconnect,
    sendMessage,
  };
}
