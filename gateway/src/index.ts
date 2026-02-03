import { createGatewayServer } from './server.js';

const PORT = parseInt(process.env.GATEWAY_PORT || '3200', 10);
const GATEWAY_SECRET = process.env.GATEWAY_SECRET;

if (!GATEWAY_SECRET) {
  console.error('Error: GATEWAY_SECRET environment variable is required');
  process.exit(1);
}

const server = createGatewayServer({ gatewaySecret: GATEWAY_SECRET });

server.listen(PORT, () => {
  console.log(`Gateway server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
