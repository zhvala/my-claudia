import type { ModeConfig } from '../../helpers/modes';

export const gatewayMode: ModeConfig = {
  id: 'gateway',
  name: 'Gateway Mode',
  enabled: true,  // Always available in test environment
  serverAddress: 'localhost:3200',  // Gateway address
  requiresAuth: true,
  gatewayUrl: 'ws://localhost:3200',
  gatewaySecret: process.env.GATEWAY_SECRET || 'test-gateway-secret',
  backendId: undefined,  // Will be fetched dynamically
  apiKey: process.env.GATEWAY_API_KEY || 'test-api-key',

  // Optional proxy
  proxyUrl: process.env.SOCKS5_PROXY_URL,
  proxyAuth: process.env.SOCKS5_PROXY_USER ? {
    username: process.env.SOCKS5_PROXY_USER,
    password: process.env.SOCKS5_PROXY_PASS
  } : undefined,
};
