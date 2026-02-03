import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  ClientMessage,
  ServerMessage,
  GatewayBackendInfo,
  ClientToGatewayMessage,
  GatewayToClientMessage
} from '@my-claudia/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useServerStore } from '../stores/serverStore';
import { usePermissionStore } from '../stores/permissionStore';

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Hook for connecting to a Backend via Gateway
 * This handles the Gateway-specific protocol:
 * 1. Connect to Gateway with gatewaySecret
 * 2. List available backends
 * 3. Connect to specific backend with apiKey
 * 4. Send/receive messages through Gateway
 */
export function useGatewaySocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentServerIdRef = useRef<string | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);

  // Gateway-specific state
  const [backends, setBackends] = useState<GatewayBackendInfo[]>([]);
  const [authenticatedBackends, setAuthenticatedBackends] = useState<Set<string>>(new Set());
  const [gatewayAuthenticated, setGatewayAuthenticated] = useState(false);

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
    updateLastConnected
  } = useServerStore();

  const { setPendingRequest } = usePermissionStore();

  // Keep ref in sync with state
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  const getGatewayWsUrl = useCallback(() => {
    const server = getActiveServer();
    console.log('[Gateway] getGatewayWsUrl check:', {
      hasServer: !!server,
      connectionMode: server?.connectionMode,
      gatewayUrl: server?.gatewayUrl
    });

    if (!server || server.connectionMode !== 'gateway' || !server.gatewayUrl) {
      console.log('[Gateway] getGatewayWsUrl returning null');
      return null;
    }

    let url = server.gatewayUrl;

    // Add protocol if missing
    if (!url.includes('://')) {
      url = `http://${url}`;
    }

    // Convert http(s) to ws(s)
    const wsUrl = url.replace(/^http/, 'ws');
    const finalUrl = wsUrl.endsWith('/ws') ? wsUrl : `${wsUrl}/ws`;
    console.log('[Gateway] getGatewayWsUrl returning:', finalUrl);
    return finalUrl;
  }, [getActiveServer]);

  // Handle backend messages (from Gateway)
  const handleBackendMessage = useCallback(
    (_backendId: string, message: ServerMessage) => {
      const currentSessionId = selectedSessionIdRef.current;

      switch (message.type) {
        case 'pong':
          break;

        case 'run_started':
          setLoading(true);
          setCurrentRunId(message.runId);
          clearToolCalls();
          clearSystemInfo();
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
          setSystemInfo(message.systemInfo);
          break;

        case 'delta':
          if (currentSessionId) {
            appendToLastMessage(currentSessionId, message.content);
          }
          break;

        case 'tool_use':
          addToolCall(message.toolUseId, message.toolName, message.toolInput);
          break;

        case 'tool_result':
          updateToolCallResult(message.toolUseId, message.result, message.isError);
          break;

        case 'run_completed':
          setLoading(false);
          setCurrentRunId(null);
          if (currentSessionId) {
            finalizeToolCallsToMessage(currentSessionId);
          }
          break;

        case 'run_failed':
          setLoading(false);
          setCurrentRunId(null);
          if (currentSessionId) {
            finalizeToolCallsToMessage(currentSessionId);
          }
          console.error('Run failed:', message.error);
          break;

        case 'session_created':
          console.log('Session created:', message.sessionId);
          break;

        case 'permission_request':
          setPendingRequest({
            requestId: message.requestId,
            toolName: message.toolName,
            detail: message.detail,
            timeoutSec: message.timeoutSeconds
          });
          break;

        case 'error':
          console.error('Backend error:', message.code, message.message);
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
    },
    [addMessage, appendToLastMessage, setLoading, setCurrentRunId, setPendingRequest, addToolCall, updateToolCallResult, clearToolCalls, finalizeToolCallsToMessage, setSystemInfo, clearSystemInfo, setProjects, setSessions]
  );

  // Handle Gateway protocol messages
  const handleGatewayMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: GatewayToClientMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'gateway_auth_result':
            if (message.success) {
              console.log('[Gateway] Authenticated to gateway');
              setGatewayAuthenticated(true);
              // Immediately request backend list
              sendGatewayMessage({ type: 'list_backends' });
            } else {
              console.error('[Gateway] Authentication failed:', message.error);
              setConnectionStatus('error', message.error || 'Gateway authentication failed');
              reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
            }
            break;

          case 'backends_list':
            console.log('[Gateway] Available backends:', message.backends);
            setBackends(message.backends);
            // Auto-connect to the configured backend if available
            const server = getActiveServer();
            if (server?.backendId) {
              const targetBackend = message.backends.find(b => b.backendId === server.backendId && b.online);
              if (targetBackend && server.apiKey) {
                console.log('[Gateway] Auto-connecting to backend:', targetBackend.backendId);
                sendGatewayMessage({
                  type: 'connect_backend',
                  backendId: targetBackend.backendId,
                  apiKey: server.apiKey
                });
              } else if (targetBackend && !server.apiKey) {
                setConnectionStatus('error', 'API Key required for backend');
              } else {
                setConnectionStatus('error', 'Backend is offline');
              }
            }
            break;

          case 'backend_auth_result':
            if (message.success) {
              console.log('[Gateway] Connected to backend:', message.backendId);
              setAuthenticatedBackends(prev => new Set([...prev, message.backendId]));
              setConnectionStatus('connected');
              setIsLocalConnection(false); // Gateway connections are always remote
              reconnectAttemptsRef.current = 0;
              if (activeServerId) {
                updateLastConnected(activeServerId);
              }
            } else {
              console.error('[Gateway] Backend auth failed:', message.error);
              setConnectionStatus('error', message.error || 'Backend authentication failed');
            }
            break;

          case 'backend_disconnected':
            console.log('[Gateway] Backend disconnected:', message.backendId);
            setAuthenticatedBackends(prev => {
              const next = new Set(prev);
              next.delete(message.backendId);
              return next;
            });
            // Update backends list
            setBackends(prev => prev.map(b =>
              b.backendId === message.backendId ? { ...b, online: false } : b
            ));
            // If this was our connected backend, update status
            const currentServer = getActiveServer();
            if (currentServer?.backendId === message.backendId) {
              setConnectionStatus('disconnected');
            }
            break;

          case 'backend_message':
            // Forward to backend message handler
            handleBackendMessage(message.backendId, message.message);
            break;

          case 'gateway_error':
            console.error('[Gateway] Error:', message.code, message.message);
            if (message.code === 'INVALID_SECRET') {
              setConnectionStatus('error', 'Invalid gateway secret');
              reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
            }
            break;
        }
      } catch (error) {
        console.error('[Gateway] Failed to parse message:', error);
      }
    },
    [getActiveServer, handleBackendMessage, activeServerId, updateLastConnected, setConnectionStatus, setIsLocalConnection]
  );

  // Send message through Gateway
  const sendGatewayMessage = useCallback((message: ClientToGatewayMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[Gateway] WebSocket is not connected');
    }
  }, []);

  // Send message to backend (wraps in send_to_backend)
  const sendMessage = useCallback((message: ClientMessage) => {
    const server = getActiveServer();
    if (!server?.backendId) {
      console.error('[Gateway] No backend configured');
      return;
    }

    sendGatewayMessage({
      type: 'send_to_backend',
      backendId: server.backendId,
      message
    });
  }, [getActiveServer, sendGatewayMessage]);

  const connect = useCallback(() => {
    console.log('[Gateway] connect() called');
    const wsUrl = getGatewayWsUrl();
    const server = getActiveServer();

    console.log('[Gateway] connect check:', {
      wsUrl,
      serverId: server?.id,
      connectionMode: server?.connectionMode,
      hasSecret: !!server?.gatewaySecret
    });

    if (!wsUrl || !server) {
      console.error('[Gateway] No gateway configured');
      setConnectionStatus('error', 'No gateway configured');
      return;
    }

    // Only connect if this is a gateway connection
    if (server.connectionMode !== 'gateway') {
      console.log('[Gateway] Skipping gateway connection - server uses direct mode');
      return;
    }

    if (!server.gatewaySecret) {
      console.error('[Gateway] No gateway secret configured');
      setConnectionStatus('error', 'Gateway secret required');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (currentServerIdRef.current === activeServerId) {
        return;
      }
      wsRef.current.close();
    }

    setConnectionStatus('connecting');
    currentServerIdRef.current = activeServerId;
    setGatewayAuthenticated(false);
    setAuthenticatedBackends(new Set());

    try {
      console.log('[Gateway] Connecting to:', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Gateway] Connected, authenticating...');
        // Send gateway authentication directly (wsRef not set yet)
        ws.send(JSON.stringify({
          type: 'gateway_auth',
          gatewaySecret: server.gatewaySecret!
        }));
      };

      ws.onclose = () => {
        console.log('[Gateway] Disconnected');
        setConnectionStatus('disconnected');
        setGatewayAuthenticated(false);
        wsRef.current = null;

        if (currentServerIdRef.current === activeServerId) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            console.log(
              `[Gateway] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
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
        console.error('[Gateway] Error:', error);
        setConnectionStatus('error', 'Connection error');
      };

      ws.onmessage = handleGatewayMessage;

      wsRef.current = ws;
    } catch (error) {
      console.error('[Gateway] Failed to connect:', error);
      setConnectionStatus('error', error instanceof Error ? error.message : 'Connection failed');
    }
  }, [getGatewayWsUrl, getActiveServer, activeServerId, handleGatewayMessage, setConnectionStatus, sendGatewayMessage]);

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
    setGatewayAuthenticated(false);
    setAuthenticatedBackends(new Set());
    setBackends([]);
  }, [setConnectionStatus]);

  // Request backend list
  const refreshBackends = useCallback(() => {
    if (gatewayAuthenticated) {
      sendGatewayMessage({ type: 'list_backends' });
    }
  }, [gatewayAuthenticated, sendGatewayMessage]);

  // Connect to a specific backend
  const connectToBackend = useCallback((backendId: string, apiKey: string) => {
    sendGatewayMessage({
      type: 'connect_backend',
      backendId,
      apiKey
    });
  }, [sendGatewayMessage]);

  // Reconnect when active server changes
  useEffect(() => {
    const server = getActiveServer();
    console.log('[Gateway Hook] useEffect triggered:', {
      activeServerId,
      connectionMode: server?.connectionMode,
      currentServerId: currentServerIdRef.current,
      shouldConnect: activeServerId && server?.connectionMode === 'gateway' && currentServerIdRef.current !== activeServerId
    });

    // If switching servers or mode changed, disconnect first
    if (currentServerIdRef.current !== null && currentServerIdRef.current !== activeServerId) {
      console.log('[Gateway Hook] Server changed, disconnecting old connection');
      disconnect();
    }

    // Connect if this is a gateway server and we're not already connected to it
    if (activeServerId && server?.connectionMode === 'gateway' && currentServerIdRef.current !== activeServerId) {
      console.log('[Gateway Hook] Triggering connect...');
      reconnectAttemptsRef.current = 0;
      connect();
    }
  }, [activeServerId, getActiveServer, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Ping to keep connection alive
  useEffect(() => {
    const { connectionStatus } = useServerStore.getState();
    if (connectionStatus !== 'connected') return;

    const server = getActiveServer();
    if (!server?.backendId) return;

    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 25000);

    return () => clearInterval(pingInterval);
  }, [sendMessage, getActiveServer]);

  const { connectionStatus } = useServerStore();

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    connect,
    disconnect,
    sendMessage,
    // Gateway-specific
    backends,
    gatewayAuthenticated,
    authenticatedBackends,
    refreshBackends,
    connectToBackend
  };
}
