import type { ModeConfig } from '../../helpers/modes';

export const remoteMode: ModeConfig = {
  id: 'remote',
  name: 'Remote IP',
  enabled: !!process.env.REMOTE_SERVER_ADDRESS,
  serverAddress: process.env.REMOTE_SERVER_ADDRESS || '192.168.1.100:3100',
  requiresAuth: true,
  apiKey: process.env.REMOTE_API_KEY || 'test-api-key',
};
