/**
 * Unified WebSocket Hook
 *
 * Replaces useWebSocket and useGatewaySocket with a single unified implementation.
 * Automatically handles both direct and gateway connections based on server configuration.
 *
 * Benefits:
 * - Eliminates 98% duplication between useWebSocket and useGatewaySocket
 * - Single source of truth for WebSocket handling
 * - Proper request-response correlation support (ready for Phase 4)
 * - Unified behavior regardless of connection mode
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage } from '@my-claudia/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useServerStore } from '../stores/serverStore';
import { usePermissionStore } from '../stores/permissionStore';
import { DirectTransport } from './transport/DirectTransport';
import { GatewayTransport } from './transport/GatewayTransport';
import type { Transport } from './transport/BaseTransport';

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useUnifiedSocket() {
  const transportRef = useRef<Transport | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const currentServerIdRef = useRef<string | null>(null);
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
    setMessages
  } = useChatStore();

  const { selectedSessionId, setProjects, setSessions, setProviderCommands } = useProjectStore();

  const {
    activeServerId,
    getActiveServer,
    setConnectionStatus,
    setIsLocalConnection,
    updateLastConnected,
    setServers
  } = useServerStore();

  const { setPendingRequest } = usePermissionStore();

  // Keep ref in sync with state
  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  /**
   * Handle incoming messages (unified for both direct and gateway modes)
   */
  const handleMessage = useCallback(
    (rawMessage: ServerMessage | any) => {
      const currentSessionId = selectedSessionIdRef.current;

      // Handle correlation envelope format from Router (Phase 2)
      // New format: { id, type, payload: {...}, metadata: {requestId, success} }
      // Old format: { type, ...data }
      let message: ServerMessage;
      if ('payload' in rawMessage && 'metadata' in rawMessage) {
        // New correlation format - extract payload and merge with type
        message = {
          type: rawMessage.type,
          ...rawMessage.payload
        } as ServerMessage;
      } else {
        // Old format - use as-is
        message = rawMessage as ServerMessage;
      }

      switch (message.type) {
        case 'auth_result':
          setConnectionStatus('connected');
          setIsLocalConnection(message.isLocalConnection || false);
          if (message.success) {
            console.log('[Socket] Authentication successful');
            reconnectAttemptsRef.current = 0;
            const server = getActiveServer();
            if (server) {
              updateLastConnected(server.id);
            }
          } else {
            console.error('[Socket] Authentication failed:', message.error);
            setConnectionStatus('error');
          }
          break;

        case 'pong':
          // Heartbeat response
          break;

        case 'delta':
          if (currentSessionId) {
            appendToLastMessage(currentSessionId, message.content);
          }
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
              createdAt: Date.now()
            });
          }
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

        case 'tool_use':
          addToolCall(message.toolUseId, message.toolName, message.toolInput);
          break;

        case 'tool_result':
          updateToolCallResult(message.toolUseId, message.result, message.isError);
          break;

        case 'permission_request':
          setPendingRequest({
            requestId: message.requestId,
            toolName: message.toolName,
            detail: message.detail,
            timeoutSec: message.timeoutSeconds
          });
          break;

        case 'projects_list':
          setProjects(message.projects);
          break;

        case 'sessions_list':
          setSessions(message.sessions);
          break;

        case 'servers_list':
          setServers(message.servers);
          break;

        case 'servers_created':
        case 'servers_updated':
        case 'servers_deleted':
          // New router responses - server list will be broadcasted separately
          console.log(`[Socket] Server operation completed:`, message.type);
          break;

        case 'server_operation_result':
          // Legacy server operation result
          if (!message.success && message.error) {
            console.error(`Server ${message.operation} failed:`, message.error);
          }
          break;

        case 'sessions_created':
        case 'sessions_updated':
        case 'sessions_deleted':
          // New router responses
          console.log(`[Socket] Session operation completed:`, message.type);
          break;

        case 'session_operation_result':
          // Legacy session operation result
          if (!message.success && message.error) {
            console.error(`Session ${message.operation} failed:`, message.error);
          }
          break;

        case 'projects_created':
        case 'projects_updated':
        case 'projects_deleted':
          // New router responses
          console.log(`[Socket] Project operation completed:`, message.type);
          break;

        case 'project_operation_result':
          // Legacy project operation result
          if (!message.success && message.error) {
            console.error(`Project ${message.operation} failed:`, message.error);
          }
          break;

        case 'providers_created':
        case 'providers_updated':
        case 'providers_deleted':
          // New router responses
          console.log(`[Socket] Provider operation completed:`, message.type);
          break;

        case 'provider_operation_result':
          // Legacy provider operation result
          if (!message.success && message.error) {
            console.error(`Provider ${message.operation} failed:`, message.error);
          }
          break;

        case 'session_messages':
          setMessages(message.sessionId, message.messages, {
            total: message.messages.length,
            hasMore: message.hasMore,
            oldestTimestamp: message.messages[0]?.createdAt
          });
          break;

        case 'provider_commands':
          setProviderCommands(message.providerId, message.commands);
          break;

        case 'system_info':
          setSystemInfo(message.systemInfo);
          break;

        case 'error':
          console.error('[Socket] Server error:', message.message);
          break;

        default:
          console.warn('[Socket] Unknown message type:', (message as any).type);
      }
    },
    [
      addMessage,
      appendToLastMessage,
      setLoading,
      setCurrentRunId,
      addToolCall,
      updateToolCallResult,
      clearToolCalls,
      finalizeToolCallsToMessage,
      setPendingRequest,
      setProjects,
      setSessions,
      setServers,
      setMessages,
      setProviderCommands,
      setSystemInfo,
      clearSystemInfo,
      setConnectionStatus,
      setIsLocalConnection,
      updateLastConnected,
      getActiveServer
    ]
  );

  /**
   * Create transport based on server configuration
   */
  const createTransport = useCallback((): Transport | null => {
    const server = getActiveServer();
    if (!server) {
      console.log('[Socket] No active server');
      return null;
    }

    console.log('[Socket] Creating transport for server:', {
      id: server.id,
      mode: server.connectionMode || 'direct',
      address: server.address
    });

    const config = {
      url: '', // Will be set below
      onMessage: handleMessage,
      onOpen: () => {
        console.log('[Socket] Transport connected');
        setConnectionStatus('connected');

        // Gateway connections are always remote
        if (server.connectionMode === 'gateway') {
          setIsLocalConnection(false);
        }

        // Send authentication message
        const authMessage: ClientMessage = {
          type: 'auth',
          apiKey: server.apiKey || ''
        };

        transportRef.current?.send(authMessage);
      },
      onClose: () => {
        console.log('[Socket] Transport disconnected');
        setConnectionStatus('disconnected');
        scheduleReconnect();
      },
      onError: (error: Event) => {
        console.error('[Socket] Transport error:', error);
        setConnectionStatus('error');
      }
    };

    // Create appropriate transport based on connection mode
    if (server.connectionMode === 'gateway' && server.gatewayUrl && server.backendId) {
      // Gateway mode - normalize URL with protocol
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
      // Direct mode - normalize URL with protocol
      const address = server.address.includes('://')
        ? server.address.replace(/^http/, 'ws')
        : `ws://${server.address}`;

      let wsUrl = `${address}/ws`;

      // Add clientId if present (for gateway routing compatibility)
      if (server.clientId) {
        wsUrl += `?clientId=${encodeURIComponent(server.clientId)}`;
      }

      return new DirectTransport({
        ...config,
        url: wsUrl
      });
    }
  }, [getActiveServer, handleMessage, setConnectionStatus]);

  /**
   * Connect to server
   */
  const connect = useCallback(() => {
    const server = getActiveServer();
    if (!server) return;

    // If already connected to the same server, don't reconnect
    if (currentServerIdRef.current === server.id && transportRef.current?.isConnected()) {
      console.log('[Socket] Already connected to server:', server.id);
      return;
    }

    // Disconnect existing connection
    if (transportRef.current) {
      transportRef.current.disconnect();
    }

    console.log('[Socket] Connecting to server:', server.id);
    currentServerIdRef.current = server.id;
    setConnectionStatus('connecting');

    // Create and connect new transport
    const transport = createTransport();
    if (transport) {
      transportRef.current = transport;
      transport.connect();
    }
  }, [getActiveServer, createTransport, setConnectionStatus]);

  /**
   * Disconnect from server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (transportRef.current) {
      transportRef.current.disconnect();
      transportRef.current = null;
    }

    currentServerIdRef.current = null;
    setConnectionStatus('disconnected');
    clearSystemInfo();
  }, [setConnectionStatus, clearSystemInfo]);

  /**
   * Schedule reconnection attempt
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Socket] Max reconnect attempts reached');
      setConnectionStatus('error');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectAttemptsRef.current++;
    console.log(`[Socket] Scheduling reconnect attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connect();
    }, RECONNECT_INTERVAL);
  }, [connect, setConnectionStatus]);

  /**
   * Send a message to server
   */
  const sendMessage = useCallback((message: ClientMessage) => {
    if (!transportRef.current?.isConnected()) {
      console.error('[Socket] Cannot send message: not connected');
      return;
    }

    transportRef.current.send(message);
  }, []);

  /**
   * Check if connected
   */
  const isConnected = useCallback(() => {
    return transportRef.current?.isConnected() || false;
  }, []);

  // Connect when active server changes
  useEffect(() => {
    if (activeServerId) {
      connect();
    } else {
      disconnect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [activeServerId, connect, disconnect]);

  // Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected()) {
        sendMessage({ type: 'ping' });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected, sendMessage]);

  return {
    sendMessage,
    isConnected: isConnected(),
    connect,
    disconnect
  };
}
