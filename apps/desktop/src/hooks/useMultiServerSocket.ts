/**
 * Multi-Server WebSocket Hook
 *
 * Manages multiple simultaneous server connections.
 * Each server has its own transport and connection state.
 * Switching active server does NOT disconnect other servers.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage, BackendServer } from '@my-claudia/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useServerStore } from '../stores/serverStore';
import { usePermissionStore } from '../stores/permissionStore';
import { DirectTransport } from './transport/DirectTransport';
import { GatewayTransport } from './transport/GatewayTransport';
import type { Transport } from './transport/BaseTransport';
import { getApiKeyInfo } from '../services/api';

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface ServerTransportState {
  transport: Transport;
  reconnectAttempts: number;
  reconnectTimeout: number | null;
}

export function useMultiServerSocket() {
  // Map of serverId -> transport state
  const transportsRef = useRef<Map<string, ServerTransportState>>(new Map());
  const selectedSessionIdRef = useRef<string | null>(null);

  // Store hooks
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
    clearSystemInfo,
  } = useChatStore();

  const { selectedSessionId } = useProjectStore();

  const {
    servers,
    activeServerId,
    setServerConnectionStatus,
    setServerLocalConnection,
    updateLastConnected,
    setApiKey
  } = useServerStore();

  const { setPendingRequest } = usePermissionStore();

  // Keep ref in sync with state
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  /**
   * Create message handler for a specific server
   */
  const createMessageHandler = useCallback((serverId: string) => {
    return (rawMessage: ServerMessage | any) => {
      const currentSessionId = selectedSessionIdRef.current;

      // Handle correlation envelope format
      let message: ServerMessage;
      if ('payload' in rawMessage && 'metadata' in rawMessage) {
        message = {
          type: rawMessage.type,
          ...rawMessage.payload
        } as ServerMessage;
      } else {
        message = rawMessage as ServerMessage;
      }

      switch (message.type) {
        case 'auth_result':
          setServerConnectionStatus(serverId, 'connected');
          setServerLocalConnection(serverId, message.isLocalConnection || false);
          if (message.success) {
            console.log(`[Socket:${serverId}] Authentication successful`);
            const state = transportsRef.current.get(serverId);
            if (state) {
              state.reconnectAttempts = 0;
            }
            updateLastConnected(serverId);
            // Fetch and store API key for local connections
            const server = servers.find(s => s.id === serverId);
            if (message.isLocalConnection && server && !server.apiKey) {
              getApiKeyInfo().then(keyInfo => {
                if (keyInfo.fullKey) {
                  setApiKey(serverId, keyInfo.fullKey);
                }
              }).catch(err => {
                console.error(`[Socket:${serverId}] Failed to fetch API key:`, err);
              });
            }
          } else {
            console.error(`[Socket:${serverId}] Authentication failed:`, message.error);
            setServerConnectionStatus(serverId, 'error', message.error);
          }
          break;

        case 'pong':
          // Heartbeat response
          break;

        case 'delta':
          // Only handle if this is from the active server
          if (serverId === activeServerId && currentSessionId) {
            appendToLastMessage(currentSessionId, message.content);
          }
          break;

        case 'run_started':
          if (serverId === activeServerId) {
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
                createdAt: Date.now()
              });
            }
          }
          break;

        case 'run_completed':
          if (serverId === activeServerId) {
            setLoading(false);
            setCurrentRunId(null);
            if (currentSessionId) {
              finalizeToolCallsToMessage(currentSessionId);
            }
          }
          break;

        case 'run_failed':
          if (serverId === activeServerId) {
            setLoading(false);
            setCurrentRunId(null);
            if (currentSessionId) {
              finalizeToolCallsToMessage(currentSessionId);
            }
            console.error(`[Socket:${serverId}] Run failed:`, message.error);
          }
          break;

        case 'tool_use':
          if (serverId === activeServerId) {
            addToolCall(message.toolUseId, message.toolName, message.toolInput);
          }
          break;

        case 'tool_result':
          if (serverId === activeServerId) {
            updateToolCallResult(message.toolUseId, message.result, message.isError);
          }
          break;

        case 'permission_request':
          if (serverId === activeServerId) {
            setPendingRequest({
              requestId: message.requestId,
              toolName: message.toolName,
              detail: message.detail,
              timeoutSec: message.timeoutSeconds
            });
          }
          break;

        case 'system_info':
          if (serverId === activeServerId) {
            setSystemInfo(message.systemInfo);
          }
          break;

        case 'error':
          console.error(`[Socket:${serverId}] Server error:`, message.message);
          break;

        default:
          console.warn(`[Socket:${serverId}] Unknown message type:`, (message as any).type);
      }
    };
  }, [
    activeServerId,
    servers,
    addMessage,
    appendToLastMessage,
    setLoading,
    setCurrentRunId,
    addToolCall,
    updateToolCallResult,
    clearToolCalls,
    finalizeToolCallsToMessage,
    setPendingRequest,
    setSystemInfo,
    clearSystemInfo,
    setServerConnectionStatus,
    setServerLocalConnection,
    updateLastConnected,
    setApiKey
  ]);

  /**
   * Create transport for a specific server
   */
  const createTransportForServer = useCallback((server: BackendServer, messageHandler: (msg: ServerMessage) => void): Transport | null => {
    console.log(`[Socket:${server.id}] Creating transport:`, {
      mode: server.connectionMode || 'direct',
      address: server.address
    });

    const config = {
      url: '', // Will be set below
      onMessage: messageHandler,
      onOpen: () => {
        console.log(`[Socket:${server.id}] Transport connected`);
        setServerConnectionStatus(server.id, 'connected');

        // Gateway connections are always remote
        if (server.connectionMode === 'gateway') {
          setServerLocalConnection(server.id, false);
        }

        // Send authentication message
        const authMessage: ClientMessage = {
          type: 'auth',
          apiKey: server.apiKey || ''
        };

        const state = transportsRef.current.get(server.id);
        state?.transport.send(authMessage);
      },
      onClose: () => {
        console.log(`[Socket:${server.id}] Transport disconnected`);
        setServerConnectionStatus(server.id, 'disconnected');
        scheduleReconnect(server.id);
      },
      onError: (error: Event) => {
        console.error(`[Socket:${server.id}] Transport error:`, error);
        setServerConnectionStatus(server.id, 'error');
      }
    };

    // Create appropriate transport based on connection mode
    if (server.connectionMode === 'gateway' && server.gatewayUrl && server.backendId) {
      const normalizedGatewayUrl = server.gatewayUrl.includes('://')
        ? server.gatewayUrl.replace(/^http/, 'ws')
        : `ws://${server.gatewayUrl}`;

      const gatewayUrl = `${normalizedGatewayUrl}/ws`;

      return new GatewayTransport({
        ...config,
        url: gatewayUrl,
        backendId: server.backendId,
        gatewaySecret: server.gatewaySecret,
        apiKey: server.apiKey
      });
    } else {
      const address = server.address.includes('://')
        ? server.address.replace(/^http/, 'ws')
        : `ws://${server.address}`;

      let wsUrl = `${address}/ws`;

      if (server.clientId) {
        wsUrl += `?clientId=${encodeURIComponent(server.clientId)}`;
      }

      return new DirectTransport({
        ...config,
        url: wsUrl
      });
    }
  }, [setServerConnectionStatus, setServerLocalConnection]);

  /**
   * Schedule reconnection for a specific server
   */
  const scheduleReconnect = useCallback((serverId: string) => {
    const state = transportsRef.current.get(serverId);
    if (!state) return;

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[Socket:${serverId}] Max reconnect attempts reached`);
      setServerConnectionStatus(serverId, 'error');
      return;
    }

    if (state.reconnectTimeout) {
      clearTimeout(state.reconnectTimeout);
    }

    state.reconnectAttempts++;
    console.log(`[Socket:${serverId}] Scheduling reconnect attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    state.reconnectTimeout = window.setTimeout(() => {
      connectServer(serverId);
    }, RECONNECT_INTERVAL);
  }, [setServerConnectionStatus]);

  /**
   * Connect to a specific server (does NOT disconnect other servers)
   */
  const connectServer = useCallback((serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) {
      console.error(`[Socket] Server not found: ${serverId}`);
      return;
    }

    // Check if already connected
    const existingState = transportsRef.current.get(serverId);
    if (existingState?.transport.isConnected()) {
      console.log(`[Socket:${serverId}] Already connected`);
      return;
    }

    // If there's an existing disconnected transport, clean it up
    if (existingState) {
      if (existingState.reconnectTimeout) {
        clearTimeout(existingState.reconnectTimeout);
      }
      existingState.transport.disconnect();
      transportsRef.current.delete(serverId);
    }

    console.log(`[Socket:${serverId}] Connecting...`);
    setServerConnectionStatus(serverId, 'connecting');

    const messageHandler = createMessageHandler(serverId);
    const transport = createTransportForServer(server, messageHandler);

    if (transport) {
      transportsRef.current.set(serverId, {
        transport,
        reconnectAttempts: 0,
        reconnectTimeout: null
      });
      transport.connect();
    }
  }, [servers, createMessageHandler, createTransportForServer, setServerConnectionStatus]);

  /**
   * Disconnect from a specific server (does NOT affect other servers)
   */
  const disconnectServer = useCallback((serverId: string) => {
    const state = transportsRef.current.get(serverId);
    if (!state) return;

    console.log(`[Socket:${serverId}] Disconnecting...`);

    if (state.reconnectTimeout) {
      clearTimeout(state.reconnectTimeout);
    }

    state.transport.disconnect();
    transportsRef.current.delete(serverId);
    setServerConnectionStatus(serverId, 'disconnected');
  }, [setServerConnectionStatus]);

  /**
   * Send message to a specific server
   */
  const sendToServer = useCallback((serverId: string, message: ClientMessage) => {
    const state = transportsRef.current.get(serverId);
    if (!state?.transport.isConnected()) {
      console.error(`[Socket:${serverId}] Cannot send message: not connected`);
      return;
    }
    state.transport.send(message);
  }, []);

  /**
   * Send message to the active server
   */
  const sendMessage = useCallback((message: ClientMessage) => {
    if (!activeServerId) {
      console.error('[Socket] Cannot send message: no active server');
      return;
    }
    sendToServer(activeServerId, message);
  }, [activeServerId, sendToServer]);

  /**
   * Check if a specific server is connected
   */
  const isServerConnected = useCallback((serverId: string) => {
    const state = transportsRef.current.get(serverId);
    return state?.transport.isConnected() || false;
  }, []);

  /**
   * Check if the active server is connected
   */
  const isConnected = useCallback(() => {
    if (!activeServerId) return false;
    return isServerConnected(activeServerId);
  }, [activeServerId, isServerConnected]);

  /**
   * Get list of connected server IDs
   */
  const getConnectedServers = useCallback(() => {
    return [...transportsRef.current.entries()]
      .filter(([_, state]) => state.transport.isConnected())
      .map(([id]) => id);
  }, []);

  // Auto-connect to active server when it changes (if not already connected)
  useEffect(() => {
    if (activeServerId) {
      const state = transportsRef.current.get(activeServerId);
      if (!state || !state.transport.isConnected()) {
        connectServer(activeServerId);
      }
    }
  }, [activeServerId, connectServer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      transportsRef.current.forEach((state) => {
        if (state.reconnectTimeout) {
          clearTimeout(state.reconnectTimeout);
        }
        state.transport.disconnect();
      });
      transportsRef.current.clear();
    };
  }, []);

  // Heartbeat for all connected servers
  useEffect(() => {
    const interval = setInterval(() => {
      transportsRef.current.forEach((state) => {
        if (state.transport.isConnected()) {
          state.transport.send({ type: 'ping' });
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    // Server-specific operations
    connectServer,
    disconnectServer,
    sendToServer,
    isServerConnected,
    getConnectedServers,

    // Active server operations (backward compatible)
    sendMessage,
    isConnected: isConnected(),
    connect: () => activeServerId && connectServer(activeServerId),
    disconnect: () => activeServerId && disconnectServer(activeServerId)
  };
}
