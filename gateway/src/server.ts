import { createServer as createHttpServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response } from 'express';
import multer from 'multer';
import type {
  GatewayBackendInfo,
  GatewayRegisterMessage,
  GatewayAuthMessage,
  GatewayListBackendsMessage,
  GatewayConnectBackendMessage,
  GatewaySendToBackendMessage,
  GatewayToBackendMessage,
  GatewayToClientMessage,
  BackendToGatewayMessage,
  ClientMessage,
  ServerMessage
} from '@my-claudia/shared';
import { GatewayStorage } from './storage.js';
import { fileStore } from './storage/fileStore.js';

interface GatewayConfig {
  gatewaySecret: string;
}

// Connected backend
interface ConnectedBackend {
  id: string;           // Internal connection ID
  backendId: string;    // Public backendId for routing
  deviceId: string;     // Device ID from registration
  name: string;         // Display name
  ws: WebSocket;
  isAlive: boolean;
}

// Connected client
interface ConnectedClient {
  id: string;           // clientId
  ws: WebSocket;
  isAlive: boolean;
  authenticated: boolean;  // Gateway auth status
  backendAuths: Set<string>;  // backendIds this client is authenticated to
}

export function createGatewayServer(config: GatewayConfig): Server {
  const storage = new GatewayStorage();
  const backends = new Map<string, ConnectedBackend>();  // backendId -> backend
  const clients = new Map<string, ConnectedClient>();    // clientId -> client
  const backendConnections = new Map<WebSocket, ConnectedBackend>();  // ws -> backend (for lookup)

  // Create Express app
  const app = express();
  app.use(express.json());

  // Configure multer for file upload
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', backends: backends.size, clients: clients.size });
  });

  // POST /api/files/upload - Upload a file
  app.post('/api/files/upload', upload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'No file provided' }
        });
        return;
      }

      // Convert to base64
      const base64Data = req.file.buffer.toString('base64');

      // Store file
      const fileId = fileStore.storeFile(
        req.file.originalname,
        req.file.mimetype,
        base64Data
      );

      res.json({
        success: true,
        data: {
          fileId,
          name: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size
        }
      });
    } catch (error) {
      console.error('[Gateway] Error uploading file:', error);
      res.status(500).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: 'Failed to upload file' }
      });
    }
  });

  // GET /api/files/:fileId - Download a file
  app.get('/api/files/:fileId', (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;

      const file = fileStore.getFile(fileId);
      if (!file) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          data: file.data // base64
        }
      });
    } catch (error) {
      console.error('[Gateway] Error retrieving file:', error);
      res.status(500).json({
        success: false,
        error: { code: 'RETRIEVAL_ERROR', message: 'Failed to retrieve file' }
      });
    }
  });

  // Create HTTP server from Express app
  const httpServer = createHttpServer(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Ping interval for connection health
  const pingInterval = setInterval(() => {
    backends.forEach((backend, backendId) => {
      if (!backend.isAlive) {
        console.log(`Backend ${backendId} disconnected (ping timeout)`);
        handleBackendDisconnect(backendId);
        return;
      }
      backend.isAlive = false;
      backend.ws.ping();
    });

    clients.forEach((client, clientId) => {
      if (!client.isAlive) {
        console.log(`Client ${clientId} disconnected (ping timeout)`);
        client.ws.terminate();
        clients.delete(clientId);
        return;
      }
      client.isAlive = false;
      client.ws.ping();
    });
  }, 30000);

  wss.on('connection', (ws: WebSocket) => {
    // We don't know yet if this is a backend or client
    // Wait for the first message to determine
    let connectionType: 'backend' | 'client' | null = null;
    let connectionId: string | null = null;

    ws.on('pong', () => {
      if (connectionType === 'backend' && connectionId) {
        const backend = backends.get(connectionId);
        if (backend) backend.isAlive = true;
      } else if (connectionType === 'client' && connectionId) {
        const client = clients.get(connectionId);
        if (client) client.isAlive = true;
      }
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // First message determines connection type
        if (!connectionType) {
          if (message.type === 'register') {
            // This is a backend
            connectionType = 'backend';
            connectionId = handleBackendRegister(ws, message as GatewayRegisterMessage);
          } else if (message.type === 'gateway_auth') {
            // This is a client
            connectionType = 'client';
            connectionId = handleClientAuth(ws, message as GatewayAuthMessage);
          } else {
            // Unknown first message - reject
            sendToWs(ws, {
              type: 'gateway_error',
              code: 'INVALID_FIRST_MESSAGE',
              message: 'First message must be register (for backends) or gateway_auth (for clients)'
            });
            ws.close();
          }
          return;
        }

        // Handle subsequent messages based on connection type
        if (connectionType === 'backend' && connectionId) {
          handleBackendMessage(connectionId, message as BackendToGatewayMessage);
        } else if (connectionType === 'client' && connectionId) {
          handleClientMessage(connectionId, message);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendToWs(ws, {
          type: 'gateway_error',
          code: 'INVALID_MESSAGE',
          message: error instanceof Error ? error.message : 'Invalid message format'
        });
      }
    });

    ws.on('close', () => {
      if (connectionType === 'backend' && connectionId) {
        handleBackendDisconnect(connectionId);
      } else if (connectionType === 'client' && connectionId) {
        handleClientDisconnect(connectionId);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  wss.on('close', () => {
    clearInterval(pingInterval);
    storage.close();
  });

  // --- Backend handlers ---

  function handleBackendRegister(ws: WebSocket, message: GatewayRegisterMessage): string | null {
    // Validate gateway secret
    if (message.gatewaySecret !== config.gatewaySecret) {
      sendToWs(ws, {
        type: 'register_result',
        success: false,
        error: 'Invalid gateway secret'
      });
      ws.close();
      return null;
    }

    // Get or create backendId for this device
    const backendId = storage.getOrCreateBackendId(message.deviceId, message.name);
    const name = message.name || `Backend ${backendId}`;

    // Check if this backendId is already connected
    const existingBackend = backends.get(backendId);
    if (existingBackend) {
      console.log(`Backend ${backendId} reconnecting, closing old connection`);
      existingBackend.ws.close(4000, 'Replaced by new connection');
      backends.delete(backendId);
      backendConnections.delete(existingBackend.ws);
    }

    const backend: ConnectedBackend = {
      id: uuidv4(),
      backendId,
      deviceId: message.deviceId,
      name,
      ws,
      isAlive: true
    };

    backends.set(backendId, backend);
    backendConnections.set(ws, backend);

    console.log(`Backend registered: ${backendId} (${name})`);

    sendToWs(ws, {
      type: 'register_result',
      success: true,
      backendId
    });

    return backendId;
  }

  function handleBackendMessage(backendId: string, message: BackendToGatewayMessage): void {
    const backend = backends.get(backendId);
    if (!backend) return;

    switch (message.type) {
      case 'client_auth_result': {
        // Forward auth result to client
        const client = clients.get(message.clientId);
        if (client) {
          if (message.success) {
            client.backendAuths.add(backendId);
          }
          sendToWs(client.ws, {
            type: 'backend_auth_result',
            backendId,
            success: message.success,
            error: message.error
          });
        }
        break;
      }

      case 'backend_response': {
        // Forward response to client
        const client = clients.get(message.clientId);
        if (client) {
          sendToWs(client.ws, {
            type: 'backend_message',
            backendId,
            message: message.message
          });
        }
        break;
      }
    }
  }

  function handleBackendDisconnect(backendId: string): void {
    const backend = backends.get(backendId);
    if (!backend) return;

    console.log(`Backend disconnected: ${backendId}`);

    // Notify all clients that were connected to this backend
    clients.forEach((client) => {
      if (client.backendAuths.has(backendId)) {
        sendToWs(client.ws, {
          type: 'backend_disconnected',
          backendId
        });
        client.backendAuths.delete(backendId);
      }
    });

    backendConnections.delete(backend.ws);
    backends.delete(backendId);
    backend.ws.terminate();
  }

  // --- Client handlers ---

  function handleClientAuth(ws: WebSocket, message: GatewayAuthMessage): string | null {
    const clientId = uuidv4();

    // Validate gateway secret
    if (message.gatewaySecret !== config.gatewaySecret) {
      sendToWs(ws, {
        type: 'gateway_auth_result',
        success: false,
        error: 'Invalid gateway secret'
      });
      ws.close();
      return null;
    }

    const client: ConnectedClient = {
      id: clientId,
      ws,
      isAlive: true,
      authenticated: true,
      backendAuths: new Set()
    };

    clients.set(clientId, client);

    console.log(`Client authenticated: ${clientId}`);

    sendToWs(ws, {
      type: 'gateway_auth_result',
      success: true
    });

    return clientId;
  }

  function handleClientMessage(clientId: string, message: unknown): void {
    const client = clients.get(clientId);
    if (!client || !client.authenticated) return;

    const msg = message as { type: string };

    switch (msg.type) {
      case 'list_backends': {
        const backendList: GatewayBackendInfo[] = [];
        backends.forEach((backend) => {
          backendList.push({
            backendId: backend.backendId,
            name: backend.name,
            online: true
          });
        });
        sendToWs(client.ws, {
          type: 'backends_list',
          backends: backendList
        });
        break;
      }

      case 'connect_backend': {
        const connectMsg = message as GatewayConnectBackendMessage;
        const backend = backends.get(connectMsg.backendId);

        if (!backend) {
          sendToWs(client.ws, {
            type: 'backend_auth_result',
            backendId: connectMsg.backendId,
            success: false,
            error: 'Backend not found or offline'
          });
          return;
        }

        // Notify backend that a client wants to connect
        sendToWs(backend.ws, {
          type: 'client_connected',
          clientId
        });

        // Forward auth request to backend
        sendToWs(backend.ws, {
          type: 'client_auth',
          clientId,
          apiKey: connectMsg.apiKey
        });
        break;
      }

      case 'send_to_backend': {
        const sendMsg = message as GatewaySendToBackendMessage;

        // Check if client is authenticated to this backend
        if (!client.backendAuths.has(sendMsg.backendId)) {
          sendToWs(client.ws, {
            type: 'gateway_error',
            code: 'NOT_AUTHENTICATED',
            message: 'Not authenticated to this backend',
            backendId: sendMsg.backendId
          });
          return;
        }

        const backend = backends.get(sendMsg.backendId);
        if (!backend) {
          sendToWs(client.ws, {
            type: 'backend_disconnected',
            backendId: sendMsg.backendId
          });
          client.backendAuths.delete(sendMsg.backendId);
          return;
        }

        // Forward message to backend
        sendToWs(backend.ws, {
          type: 'forwarded',
          clientId,
          message: sendMsg.message
        });
        break;
      }

      default:
        sendToWs(client.ws, {
          type: 'gateway_error',
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${msg.type}`
        });
    }
  }

  function handleClientDisconnect(clientId: string): void {
    const client = clients.get(clientId);
    if (!client) return;

    console.log(`Client disconnected: ${clientId}`);

    // Notify backends that this client disconnected
    client.backendAuths.forEach((backendId) => {
      const backend = backends.get(backendId);
      if (backend) {
        sendToWs(backend.ws, {
          type: 'client_disconnected',
          clientId
        });
      }
    });

    clients.delete(clientId);
  }

  // --- Helpers ---

  function sendToWs(ws: WebSocket, message: GatewayToClientMessage | GatewayToBackendMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  return httpServer;
}
