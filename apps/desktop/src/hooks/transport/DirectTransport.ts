/**
 * Direct WebSocket Transport
 *
 * Connects directly to a backend server via WebSocket.
 * Used for local connections or direct remote connections.
 */

import { BaseTransport } from './BaseTransport';

export class DirectTransport extends BaseTransport {
  connect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.status = 'connecting';
    this.ws = new WebSocket(this.config.url);
    this.setupWebSocket(this.ws);
  }
}
