/**
 * Gateway WebSocket Transport
 *
 * Connects to a backend server through a Gateway.
 * Handles Gateway-specific protocol wrapping/unwrapping.
 */

import { BaseTransport, type TransportConfig } from './BaseTransport';
import type { ClientMessage, ClientToGatewayMessage, GatewayToClientMessage } from '@my-claudia/shared';

export interface GatewayTransportConfig extends TransportConfig {
  backendId: string;
  gatewaySecret?: string;
  apiKey?: string;
}

export class GatewayTransport extends BaseTransport {
  private backendId: string;
  private gatewaySecret?: string;
  private apiKey?: string;
  private gatewayAuthenticated = false;
  private backendAuthenticated = false;

  constructor(config: GatewayTransportConfig) {
    super(config);
    this.backendId = config.backendId;
    this.gatewaySecret = config.gatewaySecret;
    this.apiKey = config.apiKey;
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.status = 'connecting';
    this.gatewayAuthenticated = false;
    this.backendAuthenticated = false;

    this.ws = new WebSocket(this.config.url);
    this.setupGatewayWebSocket(this.ws);
  }

  /**
   * Send a message through the Gateway
   * Wraps the message in Gateway protocol
   */
  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[GatewayTransport] Cannot send message: not connected');
      return;
    }

    if (!this.gatewayAuthenticated || !this.backendAuthenticated) {
      console.error('[GatewayTransport] Cannot send message: not authenticated');
      return;
    }

    // Wrap message in Gateway protocol
    const gatewayMessage: ClientToGatewayMessage = {
      type: 'send_to_backend',
      backendId: this.backendId,
      message
    };

    this.ws.send(JSON.stringify(gatewayMessage));
  }

  /**
   * Setup Gateway-specific WebSocket handlers
   */
  private setupGatewayWebSocket(ws: WebSocket): void {
    ws.onopen = () => {
      console.log('[GatewayTransport] Connected to Gateway, authenticating...');
      this.status = 'connected';

      // Authenticate with Gateway using secret
      if (this.gatewaySecret) {
        const authMsg: ClientToGatewayMessage = {
          type: 'gateway_auth',
          gatewaySecret: this.gatewaySecret
        };
        ws.send(JSON.stringify(authMsg));
      }
    };

    ws.onclose = () => {
      console.log('[GatewayTransport] Disconnected from Gateway');
      this.status = 'disconnected';
      this.ws = null;
      this.gatewayAuthenticated = false;
      this.backendAuthenticated = false;
      this.config.onClose();
    };

    ws.onerror = (error) => {
      console.error('[GatewayTransport] WebSocket error:', error);
      this.status = 'error';
      this.config.onError(error);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: GatewayToClientMessage = JSON.parse(event.data);
        this.handleGatewayMessage(message);
      } catch (error) {
        console.error('[GatewayTransport] Failed to parse Gateway message:', error);
      }
    };
  }

  /**
   * Handle Gateway-specific messages
   */
  private handleGatewayMessage(message: GatewayToClientMessage): void {
    switch (message.type) {
      case 'gateway_auth_result':
        if (message.success) {
          console.log('[GatewayTransport] Gateway authentication successful');
          this.gatewayAuthenticated = true;

          // Now connect to backend
          if (this.backendId && this.apiKey) {
            const connectMsg: ClientToGatewayMessage = {
              type: 'connect_backend',
              backendId: this.backendId,
              apiKey: this.apiKey
            };
            this.ws?.send(JSON.stringify(connectMsg));
          }
        } else {
          console.error('[GatewayTransport] Gateway authentication failed:', message.error);
          this.config.onError(new Event('Gateway authentication failed'));
        }
        break;

      case 'backend_auth_result':
        if (message.success) {
          console.log('[GatewayTransport] Backend connection successful');
          this.backendAuthenticated = true;
          // Notify that we're fully connected
          this.config.onOpen();
        } else {
          console.error('[GatewayTransport] Backend connection failed:', message.error);
          this.config.onError(new Event('Backend connection failed'));
        }
        break;

      case 'backend_message':
        // Unwrap the backend message and pass it to the handler
        if (message.message) {
          this.config.onMessage(message.message);
        }
        break;

      case 'backends_list':
        // Gateway sent list of available backends
        // This can be handled by the hook if needed
        console.log('[GatewayTransport] Available backends:', message.backends);
        break;

      case 'gateway_error':
        console.error('[GatewayTransport] Gateway error:', message.message);
        this.config.onError(new Event(message.message));
        break;

      case 'backend_disconnected':
        console.log('[GatewayTransport] Backend disconnected:', message.backendId);
        this.backendAuthenticated = false;
        break;

      default:
        console.warn('[GatewayTransport] Unknown Gateway message type:', (message as any).type);
    }
  }

  /**
   * Update backend connection (for switching backends)
   */
  setBackend(backendId: string, apiKey?: string): void {
    this.backendId = backendId;
    this.apiKey = apiKey;

    if (this.gatewayAuthenticated && this.ws?.readyState === WebSocket.OPEN && apiKey) {
      this.backendAuthenticated = false;
      const connectMsg: ClientToGatewayMessage = {
        type: 'connect_backend',
        backendId,
        apiKey
      };
      this.ws.send(JSON.stringify(connectMsg));
    }
  }
}
