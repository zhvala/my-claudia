/**
 * Base Transport Interface
 *
 * Provides abstraction over different transport mechanisms (Direct WebSocket, Gateway)
 * This allows unified handling regardless of connection mode.
 */

import type { ClientMessage, ServerMessage } from '@my-claudia/shared';

export interface TransportConfig {
  url: string;
  onMessage: (message: ServerMessage) => void;
  onOpen: () => void;
  onClose: () => void;
  onError: (error: Event) => void;
}

export interface Transport {
  /**
   * Connect to the server
   */
  connect(): void;

  /**
   * Disconnect from the server
   */
  disconnect(): void;

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void;

  /**
   * Check if connected
   */
  isConnected(): boolean;

  /**
   * Get connection status
   */
  getStatus(): 'disconnected' | 'connecting' | 'connected' | 'error';
}

/**
 * Base Transport implementation with common functionality
 */
export abstract class BaseTransport implements Transport {
  protected ws: WebSocket | null = null;
  protected status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

  constructor(protected config: TransportConfig) {}

  abstract connect(): void;

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
  }

  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Transport] Cannot send message: not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getStatus() {
    return this.status;
  }

  /**
   * Setup WebSocket event handlers (common for all transports)
   */
  protected setupWebSocket(ws: WebSocket): void {
    ws.onopen = () => {
      this.status = 'connected';
      this.config.onOpen();
    };

    ws.onclose = () => {
      this.status = 'disconnected';
      this.ws = null;
      this.config.onClose();
    };

    ws.onerror = (error) => {
      this.status = 'error';
      this.config.onError(error);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        this.config.onMessage(message);
      } catch (error) {
        console.error('[Transport] Failed to parse message:', error);
      }
    };
  }
}
