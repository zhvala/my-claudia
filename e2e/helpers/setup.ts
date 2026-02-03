import { test as base } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DB_PATH = path.join(os.homedir(), '.my-claudia', 'data.db');
const AUTH_PATH = path.join(os.homedir(), '.my-claudia', 'auth.json');

interface ApiClient {
  fetch(path: string, options?: RequestInit): Promise<Response>;
}

interface GatewayApiClient extends ApiClient {
  backendId: string;
}

export const test = base.extend<{
  cleanDB: void;
  testProject: string;
  apiKey: string;
  apiClient: ApiClient;
  gatewayApiClient: GatewayApiClient;
}>({
  // Clean database before each test
  cleanDB: async ({}, use) => {
    try {
      const db = new Database(DB_PATH);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const tableNames = tables.map(t => t.name);

      if (tableNames.includes('messages')) {
        db.exec(`DELETE FROM messages WHERE session_id LIKE 'test-%'`);
      }
      if (tableNames.includes('sessions')) {
        db.exec(`DELETE FROM sessions WHERE id LIKE 'test-%'`);
      }
      if (tableNames.includes('projects')) {
        db.exec(`DELETE FROM projects WHERE id LIKE 'test-%'`);
      }

      db.close();
    } catch (error) {
      console.warn('Database cleanup skipped:', error);
    }

    await use();
  },

  // Create test project
  testProject: async ({ cleanDB }, use) => {
    const db = new Database(DB_PATH);

    const projectId = 'test-project-' + Date.now();
    db.prepare(`
      INSERT INTO projects (id, name, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, 'Test Project', '/test/path', Date.now(), Date.now());

    db.close();

    await use(projectId);
  },

  // Read API key from auth.json
  apiKey: async ({}, use) => {
    const config = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
    await use(config.apiKey as string);
  },

  // REST client for direct backend (localhost:3100)
  apiClient: async ({ apiKey }, use) => {
    const client: ApiClient = {
      async fetch(apiPath: string, options?: RequestInit) {
        return globalThis.fetch(`http://localhost:3100${apiPath}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...options?.headers,
          },
        });
      },
    };
    await use(client);
  },

  // REST client through gateway proxy (localhost:3200)
  gatewayApiClient: async ({ apiKey }, use) => {
    // Poll until backend registers with gateway
    let backendId: string | null = null;
    for (let i = 0; i < 30; i++) {
      try {
        const resp = await globalThis.fetch('http://localhost:3100/api/server/gateway/status');
        const data = await resp.json();
        if (data.data?.backendId) {
          backendId = data.data.backendId;
          break;
        }
      } catch {
        // Gateway not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!backendId) throw new Error('Gateway backend not registered after 30s');

    const client: GatewayApiClient = {
      backendId,
      async fetch(apiPath: string, options?: RequestInit) {
        return globalThis.fetch(`http://localhost:3200/api/proxy/${backendId}${apiPath}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer test-gateway-secret:${apiKey}`,
            ...options?.headers,
          },
        });
      },
    };
    await use(client);
  },
});

export { expect } from '@playwright/test';
