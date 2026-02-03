import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer as createHttpServer, Server, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import type {
  ClientMessage,
  ServerMessage,
  PongMessage,
  ErrorMessage,
  ProviderConfig,
  AuthResultMessage,
  Project,
  Session,
  Message,
  ProjectsListMessage,
  SessionsListMessage,
  BackendServer,
  ServersListMessage,
  ServerOperationResultMessage,
  GetSessionMessagesMessage,
  SessionMessagesMessage,
  GetProviderCommandsMessage,
  ProviderCommandsMessage,
  SlashCommand,
  AddSessionMessage,
  UpdateSessionMessage,
  DeleteSessionMessage,
  AddProjectMessage,
  UpdateProjectMessage,
  DeleteProjectMessage,
  Request as CorrelatedRequest
} from '@my-claudia/shared';
import { isRequest } from '@my-claudia/shared';
import { initDatabase } from './storage/db.js';
import { createProjectRoutes } from './routes/projects.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createProviderRoutes } from './routes/providers.js';
import { createFilesRoutes } from './routes/files.js';
import { createCommandsRoutes } from './routes/commands.js';
import { createGatewayRouter, type GatewayConfig, type GatewayStatus } from './routes/gateway.js';
import { createImportRoutes } from './routes/import.js';
import { runClaude, type PermissionDecision, type SystemInfo } from './providers/claude-sdk.js';
import { scanCustomCommands } from './utils/command-scanner.js';
import { LOCAL_COMMANDS, CLI_COMMANDS } from '@my-claudia/shared';
import {
  loadOrCreateApiKey,
  regenerateApiKey,
  getMaskedApiKey,
  getFullApiKey,
  validateApiKey,
  getAuthConfigPath
} from './auth.js';

// Phase 2: New router architecture
import { createRouter } from './router/index.js';
import { ProjectRepository } from './repositories/project.js';
import { SessionRepository } from './repositories/session.js';
import { ServerRepository } from './repositories/server.js';
import { ProviderRepository } from './repositories/provider.js';
import { authMiddleware as routerAuthMiddleware } from './middleware/auth.js';
import { loggingMiddleware as routerLoggingMiddleware } from './middleware/logging.js';
import { errorHandlingMiddleware as routerErrorMiddleware } from './middleware/error.js';
import type { ConnectedClient as RouterClient } from './middleware/base.js';

// Load API key on startup
const API_KEY = loadOrCreateApiKey();

// Check if input is a slash command
function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

// Process @ mentions in user input, converting them to context hints for Claude
function processAtMentions(input: string, projectRoot: string | null): string {
  if (!projectRoot) return input;

  // Match @path/to/file patterns (paths that don't contain spaces)
  // This pattern matches @ followed by a path-like string
  const atPattern = /@([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)/g;
  const mentions: string[] = [];

  let match;
  while ((match = atPattern.exec(input)) !== null) {
    const relativePath = match[1];
    const absolutePath = path.join(projectRoot, relativePath);
    mentions.push(absolutePath);
  }

  if (mentions.length === 0) return input;

  // Build context hint for Claude
  const contextHint = mentions
    .map(p => `Please read the file at ${p} for context.`)
    .join('\n');

  return `[Context Reference]\n${contextHint}\n\n${input}`;
}

// Build status output from system info
function buildStatusOutput(systemInfo: SystemInfo): string {
  const lines: string[] = [];

  if (systemInfo.model) {
    lines.push(`**Model:** ${systemInfo.model}`);
  }
  if (systemInfo.claudeCodeVersion) {
    lines.push(`**Claude Code Version:** ${systemInfo.claudeCodeVersion}`);
  }
  if (systemInfo.cwd) {
    lines.push(`**Working Directory:** ${systemInfo.cwd}`);
  }
  if (systemInfo.permissionMode) {
    lines.push(`**Permission Mode:** ${systemInfo.permissionMode}`);
  }
  if (systemInfo.apiKeySource) {
    lines.push(`**API Key Source:** ${systemInfo.apiKeySource}`);
  }
  if (systemInfo.tools && systemInfo.tools.length > 0) {
    lines.push(`**Available Tools:** ${systemInfo.tools.length}`);
    lines.push(`  ${systemInfo.tools.join(', ')}`);
  }
  if (systemInfo.mcpServers && systemInfo.mcpServers.length > 0) {
    lines.push(`**MCP Servers:** ${systemInfo.mcpServers.length}`);
  }
  if (systemInfo.slashCommands && systemInfo.slashCommands.length > 0) {
    lines.push(`**Slash Commands:** ${systemInfo.slashCommands.join(', ')}`);
  }
  if (systemInfo.agents && systemInfo.agents.length > 0) {
    lines.push(`**Agents:** ${systemInfo.agents.join(', ')}`);
  }

  return lines.join('\n');
}

// Commands that can be handled using system info from init message
const SYSTEM_INFO_COMMANDS = ['/status'];

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  isLocal: boolean;       // Whether this is a localhost connection
  authenticated: boolean; // Whether the client has been authenticated
}

// Track active runs and their permission callbacks
interface ActiveRun {
  runId: string;
  clientId: string;
  abortController?: AbortController;
  pendingPermissions: Map<string, {
    resolve: (decision: PermissionDecision) => void;
    timeout: NodeJS.Timeout;
  }>;
}

const activeRuns = new Map<string, ActiveRun>();

// Check if request is from localhost
function isLocalhost(req: Request | IncomingMessage): boolean {
  let ip: string | undefined;
  if ('socket' in req && req.socket) {
    ip = req.socket.remoteAddress;
  }
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// Authentication middleware for REST API
// All connections require API Key authentication (including localhost)
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    });
    return;
  }

  const token = authHeader.slice(7);
  if (!validateApiKey(token)) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'Invalid API key' }
    });
    return;
  }

  next();
}

// Local-only middleware (for API key management endpoints)
function localOnlyMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isLocalhost(req)) {
    res.status(403).json({
      success: false,
      error: { code: 'LOCAL_ONLY', message: 'This endpoint is only accessible from localhost' }
    });
    return;
  }
  next();
}

// Export types for Gateway integration
export type { ConnectedClient };
export { sendMessage, handleClientMessage, activeRuns };

// Message sender interface for abstraction
export interface MessageSender {
  send: (message: ServerMessage) => void;
}

// Create a virtual client for Gateway-forwarded messages
export function createVirtualClient(
  clientId: string,
  sender: MessageSender
): ConnectedClient {
  return {
    id: clientId,
    ws: {
      readyState: 1, // WebSocket.OPEN
      send: (data: string) => {
        const message = JSON.parse(data);
        sender.send(message);
      }
    } as WebSocket,
    isAlive: true,
    isLocal: false,
    authenticated: true
  };
}

export interface ServerContext {
  server: Server;
  db: ReturnType<typeof initDatabase>;
  handleMessage: (client: ConnectedClient, message: ClientMessage) => Promise<void>;
  getGatewayStatus: () => GatewayStatus;
  connectGateway: (config: GatewayConfig) => Promise<void>;
  disconnectGateway: () => Promise<void>;
  updateGatewayBackendId: (backendId: string | null) => void;
}

export async function createServer(): Promise<ServerContext> {
  // Initialize database
  const db = initDatabase();

  // Phase 2: Create router and repositories
  const router = createRouter(db);
  const projectRepo = new ProjectRepository(db);
  const sessionRepo = new SessionRepository(db);
  const serverRepo = new ServerRepository(db);
  const providerRepo = new ProviderRepository(db);

  // Apply global middleware
  router.use(routerLoggingMiddleware, routerErrorMiddleware);

  // Register CRUD routes for all entities
  router.crud('projects', projectRepo, {
    middleware: [routerAuthMiddleware]
  });

  router.crud('sessions', sessionRepo, {
    middleware: [routerAuthMiddleware]
  });

  router.crud('servers', serverRepo, {
    middleware: [routerAuthMiddleware]
  });

  router.crud('providers', providerRepo, {
    middleware: [routerAuthMiddleware]
  });

  console.log('[Router] Initialized with routes:', router.getRoutes());

  // Create Express app
  const app: Express = express();

  app.use(cors());
  app.use(express.json());

  // WebSocket clients map (declared early so it can be used in auth endpoints)
  const clients = new Map<string, ConnectedClient>();

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Authentication endpoints (some are local-only)

  // Get server info (public - no auth required)
  // Returns whether this connection is from localhost (used by client to determine UI features)
  app.get('/api/server/info', (req: Request, res: Response) => {
    const isLocal = isLocalhost(req);
    res.json({
      success: true,
      data: {
        version: '1.0.0',
        requiresAuth: !isLocal,
        isLocalConnection: isLocal  // Backend determines if client is connecting locally
      }
    });
  });

  // Verify API key (requires auth)
  app.post('/api/auth/verify', authMiddleware, (_req: Request, res: Response) => {
    res.json({ success: true });
  });

  // Get API key info (local only)
  app.get('/api/auth/key', localOnlyMiddleware, (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        maskedKey: getMaskedApiKey(),
        fullKey: getFullApiKey(),
        configPath: getAuthConfigPath()
      }
    });
  });

  // Regenerate API key (local only)
  app.post('/api/auth/key/regenerate', localOnlyMiddleware, (_req: Request, res: Response) => {
    const newKey = regenerateApiKey();

    // Disconnect all remote (non-local) clients
    clients.forEach((client, id) => {
      if (!client.isLocal) {
        client.ws.close(4001, 'API Key rotated');
        clients.delete(id);
      }
    });

    res.json({
      success: true,
      data: {
        maskedKey: getMaskedApiKey(),
        fullKey: newKey,
        configPath: getAuthConfigPath(),
        message: 'API Key regenerated. All remote connections have been disconnected.'
      }
    });
  });

  // Gateway state (managed by index.ts)
  let gatewayStatus: GatewayStatus = {
    enabled: false,
    connected: false,
    backendId: null,
    gatewayUrl: null,
    backendName: null
  };

  // Gateway connector functions (to be implemented when gateway client support is added)
  let gatewayConnector: ((config: GatewayConfig) => Promise<void>) = async () => {
    console.warn('[Gateway] Gateway connector not implemented');
  };
  let gatewayDisconnector: (() => Promise<void>) = async () => {
    console.warn('[Gateway] Gateway disconnector not implemented');
  };

  const getGatewayStatus = () => gatewayStatus;

  const connectGateway = async (config: GatewayConfig) => {
    await gatewayConnector(config);
  };

  const disconnectGateway = async () => {
    await gatewayDisconnector();
  };

  const updateGatewayBackendId = (backendId: string | null) => {
    gatewayStatus.backendId = backendId;
    if (backendId) {
      // Update database
      db.prepare(`
        UPDATE gateway_config SET backend_id = ?, updated_at = ? WHERE id = 1
      `).run(backendId, Date.now());
    }
  };

  // API routes (protected by auth middleware)
  app.use('/api/projects', authMiddleware, createProjectRoutes(db));
  app.use('/api/sessions', authMiddleware, createSessionRoutes(db));
  app.use('/api/providers', authMiddleware, createProviderRoutes(db));
  app.use('/api/files', authMiddleware, createFilesRoutes());
  app.use('/api/commands', authMiddleware, createCommandsRoutes());
  app.use('/api/import', localOnlyMiddleware, createImportRoutes(db));
  app.use('/api/server/gateway', localOnlyMiddleware, createGatewayRouter(
    db,
    getGatewayStatus,
    connectGateway,
    disconnectGateway
  ));

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Internal server error'
      }
    });
  });

  // Create HTTP server
  const server = createHttpServer(app);

  // Create WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Ping interval for connection health
  const pingInterval = setInterval(() => {
    clients.forEach((client, id) => {
      if (!client.isAlive) {
        console.log(`Client ${id} disconnected (ping timeout)`);
        client.ws.terminate();
        clients.delete(id);
        return;
      }
      client.isAlive = false;
      client.ws.ping();
    });
  }, 30000);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = uuidv4();
    const clientIsLocal = isLocalhost(req);
    // All connections require authentication via API Key
    const client: ConnectedClient = {
      id: clientId,
      ws,
      isAlive: true,
      isLocal: clientIsLocal,
      authenticated: false  // All clients must authenticate with API Key
    };
    clients.set(clientId, client);

    console.log(`Client connected: ${clientId} (local: ${clientIsLocal}, awaiting authentication)`);

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('message', async (data: Buffer) => {
      try {
        // Parse message - supports both old and new correlation formats
        const { request, isOldFormat } = parseMessage(data.toString());

        // Extract the actual message (from payload if old format, or use request directly)
        const message: ClientMessage = isOldFormat ? request.payload as ClientMessage : request.payload as ClientMessage;

        // Handle auth message for unauthenticated clients
        if (!client.authenticated) {
          if (message.type === 'auth') {
            // Local clients always authenticate successfully (bypass API key validation)
            // Remote clients must provide valid API key
            if (client.isLocal || validateApiKey(message.apiKey)) {
              client.authenticated = true;
              console.log(`Client ${clientId} authenticated successfully (isLocal: ${client.isLocal})`);
              sendMessage(ws, {
                type: 'auth_result',
                success: true,
                isLocalConnection: client.isLocal
              } as AuthResultMessage);
            } else {
              console.log(`Client ${clientId} authentication failed: invalid API key`);
              sendMessage(ws, {
                type: 'auth_result',
                success: false,
                error: 'Invalid API key'
              } as AuthResultMessage);
              ws.close(4001, 'Authentication failed');
            }
            return;
          }

          // Reject non-auth messages from unauthenticated clients
          sendMessage(ws, {
            type: 'error',
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Send an auth message first.'
          } as ErrorMessage);
          return;
        }

        // Authenticated - first try router, then fall back to switch statement
        // Phase 2: Try new router system first
        try {
          const response = await router.route(client, request);
          if (response) {
            // Router handled the message, send correlated response
            if ((ws.readyState as number) === 1) {
              ws.send(JSON.stringify(response));
            }
            return;
          }
        } catch (error) {
          console.error('[Router] Error routing message:', error);
          // Fall through to legacy handler
        }

        // No router match - handle with legacy switch statement
        await handleClientMessage(client, message, db);
      } catch (error) {
        console.error('Error handling message:', error);
        sendMessage(ws, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: error instanceof Error ? error.message : 'Invalid message format'
        });
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      clients.delete(clientId);

      // Cancel any active runs for this client
      activeRuns.forEach((run, runId) => {
        if (run.clientId === clientId) {
          cancelRun(runId);
        }
      });
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
    });
  });

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  return {
    server,
    db,
    handleMessage: (client: ConnectedClient, message: ClientMessage) =>
      handleClientMessage(client, message, db),
    getGatewayStatus: () => gatewayStatus,
    connectGateway: async (config: GatewayConfig) => {
      gatewayStatus = {
        enabled: true,
        connected: false,
        backendId: null,
        gatewayUrl: config.gatewayUrl,
        backendName: config.backendName
      };
      await gatewayConnector(config);
    },
    disconnectGateway: async () => {
      await gatewayDisconnector();
      gatewayStatus = {
        enabled: false,
        connected: false,
        backendId: null,
        gatewayUrl: null,
        backendName: null
      };
    },
    updateGatewayBackendId: (backendId: string | null) => {
      gatewayStatus.backendId = backendId;
      gatewayStatus.connected = backendId !== null;
      if (backendId) {
        db.prepare(`
          UPDATE gateway_config SET backend_id = ?, updated_at = ? WHERE id = 1
        `).run(backendId, Date.now());
      }
    }
  };
}

function sendMessage(ws: WebSocket, message: ServerMessage): void {
  // Check readyState as number to support both real WebSocket and virtual clients
  // WebSocket.OPEN === 1, but virtual clients may have readyState typed differently
  if ((ws.readyState as number) === 1) {
    ws.send(JSON.stringify(message));
  }
}

function cancelRun(runId: string): void {
  const run = activeRuns.get(runId);
  if (run) {
    // Reject all pending permissions
    run.pendingPermissions.forEach(({ resolve, timeout }) => {
      clearTimeout(timeout);
      resolve({ behavior: 'deny', message: 'Run cancelled' });
    });
    run.pendingPermissions.clear();
    activeRuns.delete(runId);
    console.log(`Run ${runId} cancelled`);
  }
}

/**
 * Parse incoming message - supports both old and new formats
 * This enables backward compatibility during migration to correlation protocol.
 *
 * Old format: { type: 'get_projects', ... }
 * New format: { id: '...', type: 'projects.list.request', payload: {...}, ... }
 *
 * Old messages are wrapped in a Request envelope for consistent handling.
 */
function parseMessage(data: string): { request: CorrelatedRequest; isOldFormat: boolean } {
  const parsed = JSON.parse(data);

  // Check if already in new correlation format
  if (isRequest(parsed)) {
    return { request: parsed, isOldFormat: false };
  }

  // Old format - wrap in Request envelope
  const request: CorrelatedRequest = {
    id: uuidv4(),
    type: parsed.type,
    payload: parsed,
    timestamp: Date.now(),
    metadata: {
      timeout: 30000,
      requiresAuth: false
    }
  };

  return { request, isOldFormat: true };
}

async function handleClientMessage(
  client: ConnectedClient,
  message: ClientMessage,
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  switch (message.type) {
    case 'auth':
      // Auth is handled in the ws.on('message') handler before this function
      // If we reach here, the client is already authenticated (ignore duplicate auth)
      break;

    case 'ping':
      sendMessage(client.ws, { type: 'pong' } as PongMessage);
      break;

    case 'run_start':
      await handleRunStart(client, message, db);
      break;

    case 'run_cancel':
      handleRunCancel(message.runId);
      break;

    case 'permission_decision':
      handlePermissionDecision(message);
      break;

    case 'get_projects':
      await handleGetProjects(client, db);
      break;

    case 'get_sessions':
      await handleGetSessions(client, db);
      break;

    case 'get_servers':
      await handleGetServers(client, db);
      break;

    case 'add_server':
      await handleAddServer(client, db, message);
      break;

    case 'update_server':
      await handleUpdateServer(client, db, message);
      break;

    case 'delete_server':
      await handleDeleteServer(client, db, message);
      break;

    case 'get_session_messages':
      await handleGetSessionMessages(client, db, message);
      break;

    case 'get_provider_commands':
      await handleGetProviderCommands(client, db, message);
      break;

    case 'add_session':
      await handleAddSession(client, db, message);
      break;

    case 'update_session':
      await handleUpdateSession(client, db, message);
      break;

    case 'delete_session':
      await handleDeleteSession(client, db, message);
      break;

    case 'add_project':
      await handleAddProject(client, db, message);
      break;

    case 'update_project':
      await handleUpdateProject(client, db, message);
      break;

    case 'delete_project':
      await handleDeleteProject(client, db, message);
      break;

    case 'get_providers':
      await handleGetProviders(client, db);
      break;

    case 'add_provider':
      await handleAddProvider(client, db, message);
      break;

    case 'update_provider':
      await handleUpdateProvider(client, db, message);
      break;

    case 'delete_provider':
      await handleDeleteProvider(client, db, message);
      break;

    default:
      sendMessage(client.ws, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE_TYPE',
        message: `Unknown message type: ${(message as { type: string }).type}`
      } as ErrorMessage);
  }
}

async function handleRunStart(
  client: ConnectedClient,
  message: {
    type: 'run_start';
    clientRequestId: string;
    sessionId: string;
    input: string;
    providerId?: string;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  },
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  const runId = uuidv4();

  // Get session info
  const session = db.prepare(`
    SELECT s.id, s.project_id, s.sdk_session_id, p.root_path, p.provider_id
    FROM sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE s.id = ?
  `).get(message.sessionId) as {
    id: string;
    project_id: string;
    sdk_session_id: string | null;
    root_path: string | null;
    provider_id: string | null;
  } | undefined;

  if (!session) {
    sendMessage(client.ws, {
      type: 'error',
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found'
    } as ErrorMessage);
    return;
  }

  // Get provider config if specified
  const providerId = message.providerId || session.provider_id;
  let providerConfig: ProviderConfig | undefined;

  if (providerId) {
    const providerRow = db.prepare(`
      SELECT id, name, type, cli_path as cliPath, env, is_default as isDefault,
             created_at as createdAt, updated_at as updatedAt
      FROM providers WHERE id = ?
    `).get(providerId) as {
      id: string;
      name: string;
      type: string;
      cliPath: string | null;
      env: string | null;
      isDefault: number;
      createdAt: number;
      updatedAt: number;
    } | undefined;

    if (providerRow) {
      providerConfig = {
        id: providerRow.id,
        name: providerRow.name,
        type: providerRow.type as ProviderConfig['type'],
        cliPath: providerRow.cliPath || undefined,
        env: providerRow.env ? JSON.parse(providerRow.env) : undefined,
        isDefault: providerRow.isDefault === 1,
        createdAt: providerRow.createdAt,
        updatedAt: providerRow.updatedAt
      };
    }
  }

  // Create active run tracking
  const activeRun: ActiveRun = {
    runId,
    clientId: client.id,
    pendingPermissions: new Map()
  };
  activeRuns.set(runId, activeRun);

  // Track tool_use_id to tool_name mapping for this run
  const toolUseIdToName = new Map<string, string>();

  // Send run started
  sendMessage(client.ws, {
    type: 'run_started',
    runId,
    clientRequestId: message.clientRequestId
  });

  // Save user message to database
  const userMessageId = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, created_at)
    VALUES (?, ?, 'user', ?, ?)
  `).run(userMessageId, message.sessionId, message.input, Date.now());

  try {
    const cwd = session.root_path || process.cwd();
    let fullContent = '';
    let sdkSessionId = session.sdk_session_id || undefined;
    let systemInfo: SystemInfo | undefined;

    // Process @ mentions - convert file references to context hints
    const processedInput = processAtMentions(message.input, session.root_path);
    console.log('[@ Mention] Original input:', message.input);
    if (processedInput !== message.input) {
      console.log('[@ Mention] Processed input:', processedInput);
    }

    // Run Claude with streaming
    for await (const msg of runClaude(
      processedInput,
      {
        cwd,
        sessionId: sdkSessionId,
        cliPath: providerConfig?.cliPath,
        env: providerConfig?.env,
        permissionMode: message.permissionMode  // Pass permission mode to SDK
      },
      // Permission request callback
      async (request) => {
        return new Promise<PermissionDecision>((resolve) => {
          const timeoutMs = request.timeoutSeconds * 1000;

          // Set timeout for auto-deny
          const timeout = setTimeout(() => {
            activeRun.pendingPermissions.delete(request.requestId);
            resolve({ behavior: 'deny', message: 'Permission request timed out' });
          }, timeoutMs);

          // Store the resolver
          activeRun.pendingPermissions.set(request.requestId, { resolve, timeout });
          console.log(`[Permission] Stored pending permission ${request.requestId} in run ${runId}`);

          // Send permission request to client
          sendMessage(client.ws, {
            type: 'permission_request',
            requestId: request.requestId,
            toolName: request.toolName,
            detail: request.detail,
            timeoutSeconds: request.timeoutSeconds
          });
          console.log(`[Permission] Sent permission request ${request.requestId} to client`);
        });
      }
    )) {
      // Check if run was cancelled
      if (!activeRuns.has(runId)) {
        break;
      }

      switch (msg.type) {
        case 'init':
          // Save system info for potential use in /status command
          if (msg.systemInfo) {
            systemInfo = msg.systemInfo;
            // Send system info to client for display
            sendMessage(client.ws, {
              type: 'system_info',
              runId,
              systemInfo: {
                model: msg.systemInfo.model,
                claudeCodeVersion: msg.systemInfo.claudeCodeVersion,
                cwd: msg.systemInfo.cwd,
                permissionMode: msg.systemInfo.permissionMode,
                apiKeySource: msg.systemInfo.apiKeySource,
                tools: msg.systemInfo.tools,
                mcpServers: msg.systemInfo.mcpServers,
                slashCommands: msg.systemInfo.slashCommands,
                agents: msg.systemInfo.agents
              }
            });
          }
          if (msg.sessionId && !sdkSessionId) {
            sdkSessionId = msg.sessionId;
            // Update session with SDK session ID
            db.prepare(`
              UPDATE sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?
            `).run(sdkSessionId, Date.now(), message.sessionId);

            sendMessage(client.ws, {
              type: 'session_created',
              sessionId: message.sessionId,
              sdkSessionId: msg.sessionId
            });
          }
          break;

        case 'assistant':
          if (msg.content) {
            fullContent += msg.content;
            sendMessage(client.ws, {
              type: 'delta',
              runId,
              content: msg.content
            });
          }
          break;

        case 'tool_use':
          // Forward tool use to client
          console.log(`[Tool Use] ${msg.toolName} (${msg.toolUseId})`);
          // Track tool_use_id to tool_name mapping
          if (msg.toolUseId && msg.toolName) {
            toolUseIdToName.set(msg.toolUseId, msg.toolName);
          }
          sendMessage(client.ws, {
            type: 'tool_use',
            runId,
            toolUseId: msg.toolUseId || '',
            toolName: msg.toolName || '',
            toolInput: msg.toolInput
          });
          break;

        case 'tool_result': {
          // Forward tool result to client
          // Look up tool name from our tracking map
          const toolName = msg.toolUseId ? toolUseIdToName.get(msg.toolUseId) || '' : '';
          console.log(`[Tool Result] ${msg.toolUseId} (${toolName}) - error: ${msg.isToolError}`);
          sendMessage(client.ws, {
            type: 'tool_result',
            runId,
            toolUseId: msg.toolUseId || '',
            toolName: toolName,
            result: msg.toolResult,
            isError: msg.isToolError
          });
          break;
        }

        case 'result':
          // If result has content (some commands return content in result), send it
          if (msg.content) {
            fullContent += msg.content;
            sendMessage(client.ws, {
              type: 'delta',
              runId,
              content: msg.content
            });
          }

          // If this was a system-info command and we got no content, use systemInfo
          const inputTrimmed = message.input.trim().toLowerCase();
          if (!fullContent && SYSTEM_INFO_COMMANDS.includes(inputTrimmed) && systemInfo) {
            console.log(`[System Info] Building output for "${message.input}" from init data`);
            const statusOutput = buildStatusOutput(systemInfo);
            if (statusOutput) {
              fullContent = statusOutput;
              sendMessage(client.ws, {
                type: 'delta',
                runId,
                content: statusOutput
              });
            }
          }

          // Save assistant message to database
          if (fullContent) {
            const assistantMessageId = uuidv4();
            db.prepare(`
              INSERT INTO messages (id, session_id, role, content, metadata, created_at)
              VALUES (?, ?, 'assistant', ?, ?, ?)
            `).run(
              assistantMessageId,
              message.sessionId,
              fullContent,
              msg.usage ? JSON.stringify({ usage: msg.usage }) : null,
              Date.now()
            );
          }

          sendMessage(client.ws, {
            type: 'run_completed',
            runId,
            usage: msg.usage
          });
          break;
      }
    }
  } catch (error) {
    console.error('Run error:', error);
    sendMessage(client.ws, {
      type: 'run_failed',
      runId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    // Cleanup
    activeRuns.delete(runId);

    // Update session updated_at
    db.prepare(`
      UPDATE sessions SET updated_at = ? WHERE id = ?
    `).run(Date.now(), message.sessionId);
  }
}

function handleRunCancel(runId: string): void {
  cancelRun(runId);
}

function handlePermissionDecision(message: {
  type: 'permission_decision';
  requestId: string;
  allow: boolean;
  remember?: boolean;
}): void {
  console.log(`[Permission] Received decision for ${message.requestId}: ${message.allow ? 'allow' : 'deny'}`);
  console.log(`[Permission] Active runs: ${activeRuns.size}`);

  // Find the run with this pending permission
  for (const [runId, run] of activeRuns.entries()) {
    console.log(`[Permission] Checking run ${runId}, pending permissions: ${run.pendingPermissions.size}`);
    const pending = run.pendingPermissions.get(message.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      run.pendingPermissions.delete(message.requestId);

      pending.resolve({
        behavior: message.allow ? 'allow' : 'deny',
        message: message.allow ? undefined : 'User denied permission'
      });

      console.log(`[Permission] ${message.requestId}: ${message.allow ? 'allowed' : 'denied'} - resolved!`);
      return;
    }
  }

  console.warn(`[Permission] Request ${message.requestId} not found in any active run`);
}

async function handleGetProjects(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  try {
    const projects = db.prepare(`
      SELECT id, name, type, provider_id as providerId, root_path as rootPath,
             system_prompt as systemPrompt, permission_policy as permissionPolicy,
             created_at as createdAt, updated_at as updatedAt
      FROM projects
      ORDER BY updated_at DESC
    `).all() as Array<Project & { permissionPolicy: string }>;

    const result = projects.map(p => ({
      ...p,
      permissionPolicy: p.permissionPolicy ? JSON.parse(p.permissionPolicy) : undefined
    }));

    sendMessage(client.ws, {
      type: 'projects_list',
      projects: result
    } as ProjectsListMessage);
  } catch (error) {
    console.error('Error fetching projects:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: 'Failed to fetch projects'
    } as ErrorMessage);
  }
}

async function handleGetSessions(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  try {
    const sessions = db.prepare(`
      SELECT id, project_id as projectId, name, provider_id as providerId,
             sdk_session_id as sdkSessionId, created_at as createdAt, updated_at as updatedAt
      FROM sessions
      ORDER BY updated_at DESC
    `).all() as Session[];

    sendMessage(client.ws, {
      type: 'sessions_list',
      sessions
    } as SessionsListMessage);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: 'Failed to fetch sessions'
    } as ErrorMessage);
  }
}

async function handleGetServers(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  try {
    const servers = db.prepare(`
      SELECT id, name, address, connection_mode as connectionMode,
             gateway_url as gatewayUrl, gateway_secret as gatewaySecret, backend_id as backendId,
             api_key as apiKey, client_id as clientId,
             is_default as isDefault, requires_auth as requiresAuth,
             created_at as createdAt, updated_at as updatedAt, last_connected as lastConnected
      FROM servers
      ORDER BY is_default DESC, updated_at DESC
    `).all() as Array<Omit<BackendServer, 'isDefault' | 'requiresAuth'> & { isDefault: number; requiresAuth: number }>;

    const result: BackendServer[] = servers.map(s => ({
      ...s,
      isDefault: s.isDefault === 1,
      requiresAuth: s.requiresAuth === 1
    }));

    sendMessage(client.ws, {
      type: 'servers_list',
      servers: result
    } as ServersListMessage);
  } catch (error) {
    console.error('Error fetching servers:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: 'Failed to fetch servers'
    } as ErrorMessage);
  }
}

async function handleGetSessionMessages(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: GetSessionMessagesMessage
): Promise<void> {
  try {
    // Authorization check
    if (!client.isLocal && !client.authenticated) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: API key required'
      } as ErrorMessage);
      return;
    }

    const { sessionId, limit = 50, before } = message;
    console.log(`[handleGetSessionMessages] Loading messages for session ${sessionId}, limit: ${limit}, before: ${before || 'none'}`);

    // Load messages from database with pagination
    let query: string;
    let params: (string | number)[];

    if (before) {
      // Load older messages (before cursor) - for scrolling up
      query = `
        SELECT id, session_id as sessionId, role, content, metadata, created_at as createdAt
        FROM messages
        WHERE session_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [sessionId, before, limit];
    } else {
      // Initial load - get the most recent messages
      query = `
        SELECT id, session_id as sessionId, role, content, metadata, created_at as createdAt
        FROM messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;
      params = [sessionId, limit];
    }

    const messages = db.prepare(query).all(...params) as Array<Message & { metadata: string }>;

    // Reverse to get chronological order (DESC query returns newest first)
    messages.reverse();

    // Parse JSON metadata
    const result = messages.map(m => ({
      ...m,
      metadata: m.metadata ? JSON.parse(m.metadata) : undefined
    }));

    // Check if there are more messages
    const hasMore = messages.length === limit;

    console.log(`[handleGetSessionMessages] Sending ${result.length} messages for session ${sessionId}, hasMore: ${hasMore}`);
    sendMessage(client.ws, {
      type: 'session_messages',
      sessionId,
      messages: result,
      hasMore
    } as SessionMessagesMessage);

  } catch (error) {
    console.error('[handleGetSessionMessages] Error:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: error instanceof Error ? error.message : 'Failed to load messages'
    } as ErrorMessage);
  }
}

async function handleGetProviderCommands(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: GetProviderCommandsMessage
): Promise<void> {
  try {
    // Authorization check
    if (!client.isLocal && !client.authenticated) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: API key required'
      } as ErrorMessage);
      return;
    }

    const { providerId, projectRoot } = message;
    console.log(`[handleGetProviderCommands] Loading commands for provider ${providerId}, projectRoot: ${projectRoot || 'none'}`);

    // Verify provider exists
    const provider = db.prepare('SELECT type FROM providers WHERE id = ?').get(providerId) as { type: string } | undefined;
    if (!provider) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'NOT_FOUND',
        message: 'Provider not found'
      } as ErrorMessage);
      return;
    }

    // Scan custom commands (global + project if projectRoot provided)
    const customCommands = scanCustomCommands({ projectRoot });

    // Combine: local + CLI pass-through + custom commands
    const allCommands: SlashCommand[] = [
      ...LOCAL_COMMANDS,
      ...CLI_COMMANDS,
      ...customCommands
    ];

    console.log(`[handleGetProviderCommands] Sending ${allCommands.length} commands for provider ${providerId}`);
    sendMessage(client.ws, {
      type: 'provider_commands',
      providerId,
      commands: allCommands
    } as ProviderCommandsMessage);

  } catch (error) {
    console.error('[handleGetProviderCommands] Error:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: error instanceof Error ? error.message : 'Failed to load commands'
    } as ErrorMessage);
  }
}

async function handleAddServer(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'add_server'; server: any }
): Promise<void> {
  try {
    const id = `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const { server } = message;

    // If this server is set as default, unset other defaults
    if (server.isDefault) {
      db.prepare('UPDATE servers SET is_default = 0').run();
    }

    db.prepare(`
      INSERT INTO servers (
        id, name, address, connection_mode,
        gateway_url, gateway_secret, backend_id,
        api_key, client_id, is_default, requires_auth,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      server.name,
      server.address,
      server.connectionMode || 'direct',
      server.gatewayUrl || null,
      server.gatewaySecret || null,
      server.backendId || null,
      server.apiKey || null,
      server.clientId || null,
      server.isDefault ? 1 : 0,
      server.requiresAuth ? 1 : 0,
      now,
      now
    );

    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: true,
      operation: 'add',
      serverId: id
    } as ServerOperationResultMessage);

    // Send updated server list
    await handleGetServers(client, db);
  } catch (error) {
    console.error('Error adding server:', error);
    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: false,
      operation: 'add',
      error: error instanceof Error ? error.message : 'Failed to add server'
    } as ServerOperationResultMessage);
  }
}

async function handleUpdateServer(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'update_server'; id: string; server: any }
): Promise<void> {
  try {
    const { id, server } = message;

    // If this server is set as default, unset other defaults
    if (server.isDefault) {
      db.prepare('UPDATE servers SET is_default = 0 WHERE id != ?').run(id);
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (server.name !== undefined) {
      updates.push('name = ?');
      values.push(server.name);
    }
    if (server.address !== undefined) {
      updates.push('address = ?');
      values.push(server.address);
    }
    if (server.connectionMode !== undefined) {
      updates.push('connection_mode = ?');
      values.push(server.connectionMode);
    }
    if (server.gatewayUrl !== undefined) {
      updates.push('gateway_url = ?');
      values.push(server.gatewayUrl || null);
    }
    if (server.gatewaySecret !== undefined) {
      updates.push('gateway_secret = ?');
      values.push(server.gatewaySecret || null);
    }
    if (server.backendId !== undefined) {
      updates.push('backend_id = ?');
      values.push(server.backendId || null);
    }
    if (server.apiKey !== undefined) {
      updates.push('api_key = ?');
      values.push(server.apiKey || null);
    }
    if (server.clientId !== undefined) {
      updates.push('client_id = ?');
      values.push(server.clientId || null);
    }
    if (server.isDefault !== undefined) {
      updates.push('is_default = ?');
      values.push(server.isDefault ? 1 : 0);
    }
    if (server.requiresAuth !== undefined) {
      updates.push('requires_auth = ?');
      values.push(server.requiresAuth ? 1 : 0);
    }
    if (server.lastConnected !== undefined) {
      updates.push('last_connected = ?');
      values.push(server.lastConnected);
    }

    updates.push('updated_at = ?');
    values.push(Date.now());

    values.push(id);

    db.prepare(`
      UPDATE servers
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: true,
      operation: 'update',
      serverId: id
    } as ServerOperationResultMessage);

    // Send updated server list
    await handleGetServers(client, db);
  } catch (error) {
    console.error('Error updating server:', error);
    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: false,
      operation: 'update',
      error: error instanceof Error ? error.message : 'Failed to update server'
    } as ServerOperationResultMessage);
  }
}

async function handleDeleteServer(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'delete_server'; id: string }
): Promise<void> {
  try {
    const { id } = message;

    // Don't allow deleting the default local server
    if (id === 'local') {
      sendMessage(client.ws, {
        type: 'server_operation_result',
        success: false,
        operation: 'delete',
        error: 'Cannot delete the default local server'
      } as ServerOperationResultMessage);
      return;
    }

    db.prepare('DELETE FROM servers WHERE id = ?').run(id);

    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: true,
      operation: 'delete',
      serverId: id
    } as ServerOperationResultMessage);

    // Send updated server list
    await handleGetServers(client, db);
  } catch (error) {
    console.error('Error deleting server:', error);
    sendMessage(client.ws, {
      type: 'server_operation_result',
      success: false,
      operation: 'delete',
      error: error instanceof Error ? error.message : 'Failed to delete server'
    } as ServerOperationResultMessage);
  }
}

// ============================================
// Session CRUD Handlers
// ============================================

async function handleAddSession(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'add_session'; session: any }
): Promise<void> {
  try {
    // Only local connections can modify sessions
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can create sessions'
      } as ErrorMessage);
      return;
    }

    const { session } = message;
    const id = uuidv4();
    const now = Date.now();

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(session.projectId);
    if (!project) {
      sendMessage(client.ws, {
        type: 'session_operation_result',
        success: false,
        operation: 'add',
        error: 'Project not found'
      } as import('@my-claudia/shared').SessionOperationResultMessage);
      return;
    }

    db.prepare(`
      INSERT INTO sessions (id, project_id, name, provider_id, sdk_session_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      session.projectId,
      session.name || null,
      session.providerId || null,
      session.sdkSessionId || null,
      now,
      now
    );

    const newSession: Session = {
      id,
      projectId: session.projectId,
      name: session.name,
      providerId: session.providerId,
      sdkSessionId: session.sdkSessionId,
      createdAt: now,
      updatedAt: now
    };

    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: true,
      operation: 'add',
      session: newSession
    } as import('@my-claudia/shared').SessionOperationResultMessage);

    // Broadcast updated session list
    await handleGetSessions(client, db);
  } catch (error) {
    console.error('Error adding session:', error);
    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: false,
      operation: 'add',
      error: error instanceof Error ? error.message : 'Failed to add session'
    } as import('@my-claudia/shared').SessionOperationResultMessage);
  }
}

async function handleUpdateSession(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'update_session'; id: string; session: any }
): Promise<void> {
  try {
    // Only local connections can modify sessions
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can update sessions'
      } as ErrorMessage);
      return;
    }

    const { id, session } = message;
    const now = Date.now();

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (session.name !== undefined) {
      updates.push('name = ?');
      values.push(session.name || null);
    }
    if (session.providerId !== undefined) {
      updates.push('provider_id = ?');
      values.push(session.providerId || null);
    }
    if (session.sdkSessionId !== undefined) {
      updates.push('sdk_session_id = ?');
      values.push(session.sdkSessionId || null);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    const result = db.prepare(`
      UPDATE sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'session_operation_result',
        success: false,
        operation: 'update',
        error: 'Session not found'
      } as import('@my-claudia/shared').SessionOperationResultMessage);
      return;
    }

    // Get updated session
    const updatedSession = db.prepare(`
      SELECT id, project_id as projectId, name, provider_id as providerId,
             sdk_session_id as sdkSessionId, created_at as createdAt, updated_at as updatedAt
      FROM sessions WHERE id = ?
    `).get(id) as Session;

    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: true,
      operation: 'update',
      session: updatedSession
    } as import('@my-claudia/shared').SessionOperationResultMessage);

    // Broadcast updated session list
    await handleGetSessions(client, db);
  } catch (error) {
    console.error('Error updating session:', error);
    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: false,
      operation: 'update',
      error: error instanceof Error ? error.message : 'Failed to update session'
    } as import('@my-claudia/shared').SessionOperationResultMessage);
  }
}

async function handleDeleteSession(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'delete_session'; id: string }
): Promise<void> {
  try {
    // Only local connections can modify sessions
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can delete sessions'
      } as ErrorMessage);
      return;
    }

    const { id } = message;

    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'session_operation_result',
        success: false,
        operation: 'delete',
        error: 'Session not found'
      } as import('@my-claudia/shared').SessionOperationResultMessage);
      return;
    }

    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: true,
      operation: 'delete'
    } as import('@my-claudia/shared').SessionOperationResultMessage);

    // Broadcast updated session list
    await handleGetSessions(client, db);
  } catch (error) {
    console.error('Error deleting session:', error);
    sendMessage(client.ws, {
      type: 'session_operation_result',
      success: false,
      operation: 'delete',
      error: error instanceof Error ? error.message : 'Failed to delete session'
    } as import('@my-claudia/shared').SessionOperationResultMessage);
  }
}

// ============================================
// Project CRUD Handlers
// ============================================

async function handleAddProject(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'add_project'; project: any }
): Promise<void> {
  try {
    // Only local connections can modify projects
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can create projects'
      } as ErrorMessage);
      return;
    }

    const { project } = message;
    const id = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO projects (
        id, name, type, provider_id, root_path, system_prompt,
        permission_policy, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      project.name,
      project.type || 'code',
      project.providerId || null,
      project.rootPath || null,
      project.systemPrompt || null,
      project.permissionPolicy ? JSON.stringify(project.permissionPolicy) : null,
      now,
      now
    );

    const newProject: Project = {
      id,
      name: project.name,
      type: project.type || 'code',
      providerId: project.providerId,
      rootPath: project.rootPath,
      systemPrompt: project.systemPrompt,
      permissionPolicy: project.permissionPolicy,
      createdAt: now,
      updatedAt: now
    };

    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: true,
      operation: 'add',
      project: newProject
    } as import('@my-claudia/shared').ProjectOperationResultMessage);

    // Broadcast updated project list
    await handleGetProjects(client, db);
  } catch (error) {
    console.error('Error adding project:', error);
    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: false,
      operation: 'add',
      error: error instanceof Error ? error.message : 'Failed to add project'
    } as import('@my-claudia/shared').ProjectOperationResultMessage);
  }
}

async function handleUpdateProject(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'update_project'; id: string; project: any }
): Promise<void> {
  try {
    // Only local connections can modify projects
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can update projects'
      } as ErrorMessage);
      return;
    }

    const { id, project } = message;
    const now = Date.now();

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (project.name !== undefined) {
      updates.push('name = ?');
      values.push(project.name);
    }
    if (project.type !== undefined) {
      updates.push('type = ?');
      values.push(project.type);
    }
    if (project.providerId !== undefined) {
      updates.push('provider_id = ?');
      values.push(project.providerId || null);
    }
    if (project.rootPath !== undefined) {
      updates.push('root_path = ?');
      values.push(project.rootPath || null);
    }
    if (project.systemPrompt !== undefined) {
      updates.push('system_prompt = ?');
      values.push(project.systemPrompt || null);
    }
    if (project.permissionPolicy !== undefined) {
      updates.push('permission_policy = ?');
      values.push(project.permissionPolicy ? JSON.stringify(project.permissionPolicy) : null);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    const result = db.prepare(`
      UPDATE projects
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'project_operation_result',
        success: false,
        operation: 'update',
        error: 'Project not found'
      } as import('@my-claudia/shared').ProjectOperationResultMessage);
      return;
    }

    // Get updated project
    const updatedProject = db.prepare(`
      SELECT id, name, type, provider_id as providerId, root_path as rootPath,
             system_prompt as systemPrompt, permission_policy as permissionPolicy,
             created_at as createdAt, updated_at as updatedAt
      FROM projects WHERE id = ?
    `).get(id) as Project & { permissionPolicy: string };

    const projectResult: Project = {
      ...updatedProject,
      permissionPolicy: updatedProject.permissionPolicy ? JSON.parse(updatedProject.permissionPolicy) : undefined
    };

    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: true,
      operation: 'update',
      project: projectResult
    } as import('@my-claudia/shared').ProjectOperationResultMessage);

    // Broadcast updated project list
    await handleGetProjects(client, db);
  } catch (error) {
    console.error('Error updating project:', error);
    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: false,
      operation: 'update',
      error: error instanceof Error ? error.message : 'Failed to update project'
    } as import('@my-claudia/shared').ProjectOperationResultMessage);
  }
}

async function handleDeleteProject(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'delete_project'; id: string }
): Promise<void> {
  try {
    // Only local connections can modify projects
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can delete projects'
      } as ErrorMessage);
      return;
    }

    const { id } = message;

    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'project_operation_result',
        success: false,
        operation: 'delete',
        error: 'Project not found'
      } as import('@my-claudia/shared').ProjectOperationResultMessage);
      return;
    }

    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: true,
      operation: 'delete'
    } as import('@my-claudia/shared').ProjectOperationResultMessage);

    // Broadcast updated project list
    await handleGetProjects(client, db);
  } catch (error) {
    console.error('Error deleting project:', error);
    sendMessage(client.ws, {
      type: 'project_operation_result',
      success: false,
      operation: 'delete',
      error: error instanceof Error ? error.message : 'Failed to delete project'
    } as import('@my-claudia/shared').ProjectOperationResultMessage);
  }
}

// ============================================
// Provider CRUD Handlers
// ============================================

async function handleGetProviders(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>
): Promise<void> {
  try {
    const providers = db.prepare(`
      SELECT id, name, type, cli_path as cliPath, env,
             is_default as isDefault, created_at as createdAt, updated_at as updatedAt
      FROM providers
      ORDER BY is_default DESC, name ASC
    `).all() as Array<Omit<ProviderConfig, 'isDefault' | 'cliPath' | 'env'> & { isDefault: number; cliPath: string | null; env: string | null }>;

    const result: ProviderConfig[] = providers.map(p => ({
      ...p,
      isDefault: p.isDefault === 1,
      cliPath: p.cliPath || undefined,
      env: p.env ? JSON.parse(p.env) : undefined
    }));

    sendMessage(client.ws, {
      type: 'providers_list',
      providers: result
    } as import('@my-claudia/shared').ProvidersListMessage);
  } catch (error) {
    console.error('Error fetching providers:', error);
    sendMessage(client.ws, {
      type: 'error',
      code: 'DB_ERROR',
      message: 'Failed to fetch providers'
    } as ErrorMessage);
  }
}

async function handleAddProvider(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'add_provider'; provider: any }
): Promise<void> {
  try {
    // Only local connections can modify providers
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can create providers'
      } as ErrorMessage);
      return;
    }

    const { provider } = message;
    const id = uuidv4();
    const now = Date.now();

    // If this provider is default, unset other defaults
    if (provider.isDefault) {
      db.prepare('UPDATE providers SET is_default = 0').run();
    }

    db.prepare(`
      INSERT INTO providers (id, name, type, cli_path, env, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      provider.name,
      provider.type || 'claude',
      provider.cliPath || null,
      provider.env ? JSON.stringify(provider.env) : null,
      provider.isDefault ? 1 : 0,
      now,
      now
    );

    const newProvider: ProviderConfig = {
      id,
      name: provider.name,
      type: provider.type || 'claude',
      cliPath: provider.cliPath,
      env: provider.env,
      isDefault: provider.isDefault || false,
      createdAt: now,
      updatedAt: now
    };

    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: true,
      operation: 'add',
      provider: newProvider
    } as import('@my-claudia/shared').ProviderOperationResultMessage);

    // Broadcast updated provider list
    await handleGetProviders(client, db);
  } catch (error) {
    console.error('Error adding provider:', error);
    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: false,
      operation: 'add',
      error: error instanceof Error ? error.message : 'Failed to add provider'
    } as import('@my-claudia/shared').ProviderOperationResultMessage);
  }
}

async function handleUpdateProvider(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'update_provider'; id: string; provider: any }
): Promise<void> {
  try {
    // Only local connections can modify providers
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can update providers'
      } as ErrorMessage);
      return;
    }

    const { id, provider } = message;
    const now = Date.now();

    // If this provider is becoming default, unset other defaults
    if (provider.isDefault) {
      db.prepare('UPDATE providers SET is_default = 0 WHERE id != ?').run(id);
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];

    if (provider.name !== undefined) {
      updates.push('name = ?');
      values.push(provider.name);
    }
    if (provider.type !== undefined) {
      updates.push('type = ?');
      values.push(provider.type);
    }
    if (provider.cliPath !== undefined) {
      updates.push('cli_path = ?');
      values.push(provider.cliPath || null);
    }
    if (provider.env !== undefined) {
      updates.push('env = ?');
      values.push(provider.env ? JSON.stringify(provider.env) : null);
    }
    if (provider.isDefault !== undefined) {
      updates.push('is_default = ?');
      values.push(provider.isDefault ? 1 : 0);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    const result = db.prepare(`
      UPDATE providers
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...values);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'provider_operation_result',
        success: false,
        operation: 'update',
        error: 'Provider not found'
      } as import('@my-claudia/shared').ProviderOperationResultMessage);
      return;
    }

    // Get updated provider
    const updatedProvider = db.prepare(`
      SELECT id, name, type, cli_path as cliPath, env,
             is_default as isDefault, created_at as createdAt, updated_at as updatedAt
      FROM providers WHERE id = ?
    `).get(id) as (Omit<ProviderConfig, 'isDefault' | 'cliPath' | 'env'> & { isDefault: number; cliPath: string | null; env: string | null });

    const providerResult: ProviderConfig = {
      ...updatedProvider,
      isDefault: updatedProvider.isDefault === 1,
      cliPath: updatedProvider.cliPath || undefined,
      env: updatedProvider.env ? JSON.parse(updatedProvider.env) : undefined
    };

    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: true,
      operation: 'update',
      provider: providerResult
    } as import('@my-claudia/shared').ProviderOperationResultMessage);

    // Broadcast updated provider list
    await handleGetProviders(client, db);
  } catch (error) {
    console.error('Error updating provider:', error);
    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: false,
      operation: 'update',
      error: error instanceof Error ? error.message : 'Failed to update provider'
    } as import('@my-claudia/shared').ProviderOperationResultMessage);
  }
}

async function handleDeleteProvider(
  client: ConnectedClient,
  db: ReturnType<typeof initDatabase>,
  message: { type: 'delete_provider'; id: string }
): Promise<void> {
  try {
    // Only local connections can modify providers
    if (!client.isLocal) {
      sendMessage(client.ws, {
        type: 'error',
        code: 'FORBIDDEN',
        message: 'Only local connections can delete providers'
      } as ErrorMessage);
      return;
    }

    const { id } = message;

    const result = db.prepare('DELETE FROM providers WHERE id = ?').run(id);

    if (result.changes === 0) {
      sendMessage(client.ws, {
        type: 'provider_operation_result',
        success: false,
        operation: 'delete',
        error: 'Provider not found'
      } as import('@my-claudia/shared').ProviderOperationResultMessage);
      return;
    }

    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: true,
      operation: 'delete'
    } as import('@my-claudia/shared').ProviderOperationResultMessage);

    // Broadcast updated provider list
    await handleGetProviders(client, db);
  } catch (error) {
    console.error('Error deleting provider:', error);
    sendMessage(client.ws, {
      type: 'provider_operation_result',
      success: false,
      operation: 'delete',
      error: error instanceof Error ? error.message : 'Failed to delete provider'
    } as import('@my-claudia/shared').ProviderOperationResultMessage);
  }
}
