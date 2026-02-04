/**
 * Global Setup - Multi-service startup for E2E tests
 *
 * Replaces playwright.config.ts webServer configuration.
 * Starts gateway → server → desktop in order, waits for ports to be ready.
 */
import { spawn, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import * as path from 'path';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

interface ServiceConfig {
  name: string;
  command: string;
  cwd: string;
  port: number;
  timeout: number;
  env?: Record<string, string>;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'Gateway',
    command: 'pnpm run dev',
    cwd: path.join(ROOT_DIR, 'gateway'),
    port: 3200,
    timeout: 120000,
    env: {
      GATEWAY_SECRET: 'test-secret-my-claudia-2026',
    },
  },
  {
    name: 'Server',
    command: 'pnpm run dev',
    cwd: path.join(ROOT_DIR, 'server'),
    port: 3100,
    timeout: 120000,
    env: {
      GATEWAY_URL: 'ws://localhost:3200',
      GATEWAY_SECRET: 'test-secret-my-claudia-2026',
      GATEWAY_NAME: 'TestBackend',
    },
  },
  {
    name: 'Desktop',
    command: 'pnpm run dev',
    cwd: path.join(ROOT_DIR, 'apps/desktop'),
    port: 1420,
    timeout: 120000,
  },
];

const processes: ChildProcess[] = [];

/**
 * Check if a port is already in use (service already running)
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    // Try localhost (resolves to both IPv4 and IPv6) instead of 127.0.0.1
    const conn = createConnection({ port, host: 'localhost' });
    conn.on('connect', () => {
      conn.destroy();
      resolve(true);
    });
    conn.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Wait for a port to become available
 */
async function waitForPort(port: number, timeout: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await isPortInUse(port)) {
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} did not become available within ${timeout}ms`);
}

/**
 * Start a service as a child process
 */
function startService(config: ServiceConfig): ChildProcess {
  const [cmd, ...args] = config.command.split(' ');
  const child = spawn(cmd, args, {
    cwd: config.cwd,
    env: {
      ...process.env,
      ...config.env,
    },
    stdio: 'pipe',
    shell: true,
  });

  child.stdout?.on('data', (data) => {
    if (process.env.DEBUG) {
      console.log(`[${config.name}] ${data.toString().trim()}`);
    }
  });

  child.stderr?.on('data', (data) => {
    if (process.env.DEBUG) {
      console.error(`[${config.name}] ${data.toString().trim()}`);
    }
  });

  child.on('error', (err) => {
    console.error(`[${config.name}] Process error:`, err);
  });

  return child;
}

/**
 * Vitest globalSetup entry point
 */
export async function setup() {
  const reuseExisting = !process.env.CI;

  for (const service of SERVICES) {
    const alreadyRunning = await isPortInUse(service.port);

    if (alreadyRunning && reuseExisting) {
      console.log(`[Setup] ${service.name} already running on port ${service.port}, reusing`);
      continue;
    }

    if (alreadyRunning && !reuseExisting) {
      console.warn(`[Setup] Port ${service.port} is in use but CI mode requires fresh servers`);
    }

    console.log(`[Setup] Starting ${service.name} on port ${service.port}...`);
    const child = startService(service);
    processes.push(child);

    await waitForPort(service.port, service.timeout);
    console.log(`[Setup] ${service.name} is ready on port ${service.port}`);
  }
}

/**
 * Vitest globalSetup teardown
 */
export async function teardown() {
  for (const proc of processes) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Ignore
    }
  }

  // Wait a moment for graceful shutdown
  await new Promise(r => setTimeout(r, 1000));

  // Force kill any remaining
  for (const proc of processes) {
    try {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Ignore
    }
  }

  processes.length = 0;
}
