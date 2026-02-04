/**
 * HTTP Migration API Tests
 *
 * Direct REST API tests (no browser UI) verifying backend and gateway proxy endpoints.
 * Tests cover: Projects, Sessions, Servers, Providers CRUD + auth + gateway proxy.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { readApiKey, createApiClient, createGatewayApiClient, type ApiClient, type GatewayApiClient } from '../helpers/setup';

let apiKey: string;
let apiClient: ApiClient;
let gatewayApiClient: GatewayApiClient;

beforeAll(async () => {
  apiKey = readApiKey();
  apiClient = createApiClient(apiKey);
  gatewayApiClient = await createGatewayApiClient(apiKey);
});

// ─────────────────────────────────────────────
// 3A: Backend API (localhost:3100) — Direct
// ─────────────────────────────────────────────

describe('Backend API - Direct', () => {
  describe('Auth', () => {
    test('401 when missing Bearer token', async () => {
      const resp = await fetch('http://localhost:3100/api/projects');
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    test('401 when invalid token', async () => {
      const resp = await fetch('http://localhost:3100/api/projects', {
        headers: { 'Authorization': 'Bearer invalid-key-123' },
      });
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error.code).toBe('INVALID_API_KEY');
    });
  });

  describe('Projects CRUD', () => {
    let createdId: string;

    test('GET /api/projects - list', async () => {
      const resp = await apiClient.fetch('/api/projects');
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('POST /api/projects - create', async () => {
      const resp = await apiClient.fetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'E2E Test Project', path: '/tmp/e2e-test' }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Test Project');
      createdId = body.data.id;
    });

    test('PUT /api/projects/:id - update', async () => {
      const createResp = await apiClient.fetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'To Update', path: '/tmp/update-test' }),
      });
      const created = await createResp.json();
      const id = created.data.id;

      const resp = await apiClient.fetch(`/api/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Name' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      const getResp = await apiClient.fetch(`/api/projects`);
      const getBody = await getResp.json();
      const updated = getBody.data.find((p: any) => p.id === id);
      expect(updated?.name).toBe('Updated Name');

      await apiClient.fetch(`/api/projects/${id}`, { method: 'DELETE' });
    });

    test('DELETE /api/projects/:id - delete', async () => {
      const createResp = await apiClient.fetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'To Delete', path: '/tmp/delete-test' }),
      });
      const created = await createResp.json();
      const id = created.data.id;

      const resp = await apiClient.fetch(`/api/projects/${id}`, { method: 'DELETE' });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Sessions CRUD', () => {
    test('GET /api/sessions - list', async () => {
      const resp = await apiClient.fetch('/api/sessions');
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('POST /api/sessions - create', async () => {
      const projResp = await apiClient.fetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Session Test Project', path: '/tmp/session-test' }),
      });
      const proj = await projResp.json();

      const resp = await apiClient.fetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'E2E Test Session', projectId: proj.data.id }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Test Session');

      await apiClient.fetch(`/api/sessions/${body.data.id}`, { method: 'DELETE' });
      await apiClient.fetch(`/api/projects/${proj.data.id}`, { method: 'DELETE' });
    });

    test('GET /api/sessions/:id/messages - paginated messages', async () => {
      const projResp = await apiClient.fetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Msg Test Project', path: '/tmp/msg-test' }),
      });
      const proj = await projResp.json();

      const sessResp = await apiClient.fetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ name: 'Msg Test Session', projectId: proj.data.id }),
      });
      const sess = await sessResp.json();

      const resp = await apiClient.fetch(`/api/sessions/${sess.data.id}/messages?limit=50`);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.messages)).toBe(true);

      await apiClient.fetch(`/api/sessions/${sess.data.id}`, { method: 'DELETE' });
      await apiClient.fetch(`/api/projects/${proj.data.id}`, { method: 'DELETE' });
    });
  });

  describe('Servers CRUD', () => {
    test('GET /api/servers - list', async () => {
      const resp = await apiClient.fetch('/api/servers');
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.some((s: any) => s.id === 'local')).toBe(true);
    });

    test('POST /api/servers - create', async () => {
      const resp = await apiClient.fetch('/api/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'E2E Remote Server',
          address: '192.168.1.100:3100',
          connectionMode: 'direct',
        }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('E2E Remote Server');

      await apiClient.fetch(`/api/servers/${body.data.id}`, { method: 'DELETE' });
    });

    test('PUT /api/servers/:id - update', async () => {
      const createResp = await apiClient.fetch('/api/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'To Update Server',
          address: '10.0.0.1:3100',
          connectionMode: 'direct',
        }),
      });
      const created = await createResp.json();
      const id = created.data.id;

      const resp = await apiClient.fetch(`/api/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated Server' }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      const getResp = await apiClient.fetch('/api/servers');
      const getBody = await getResp.json();
      const updated = getBody.data.find((s: any) => s.id === id);
      expect(updated?.name).toBe('Updated Server');

      await apiClient.fetch(`/api/servers/${id}`, { method: 'DELETE' });
    });

    test('DELETE /api/servers/:id - cannot delete local', async () => {
      const resp = await apiClient.fetch('/api/servers/local', { method: 'DELETE' });
      expect(resp.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Providers CRUD', () => {
    test('GET /api/providers - list', async () => {
      const resp = await apiClient.fetch('/api/providers');
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────
// 3B: Gateway Proxy (localhost:3200)
// ─────────────────────────────────────────────

describe('Gateway Proxy API', () => {
  test('GET /api/proxy/:backendId/api/projects - proxy success', async () => {
    const resp = await gatewayApiClient.fetch('/api/projects');
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('POST /api/proxy/:backendId/api/projects - create via proxy', async () => {
    const resp = await gatewayApiClient.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Gateway Test Project', path: '/tmp/gw-test' }),
    });
    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Gateway Test Project');

    await gatewayApiClient.fetch(`/api/projects/${body.data.id}`, { method: 'DELETE' });
  });

  test('PUT /api/proxy/:backendId/api/projects/:id - update via proxy', async () => {
    const createResp = await gatewayApiClient.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'GW Update Test', path: '/tmp/gw-update' }),
    });
    const created = await createResp.json();
    const id = created.data.id;

    const resp = await gatewayApiClient.fetch(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'GW Updated' }),
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    const getResp = await gatewayApiClient.fetch('/api/projects');
    const getBody = await getResp.json();
    const updated = getBody.data.find((p: any) => p.id === id);
    expect(updated?.name).toBe('GW Updated');

    await gatewayApiClient.fetch(`/api/projects/${id}`, { method: 'DELETE' });
  });

  test('DELETE /api/proxy/:backendId/api/projects/:id - delete via proxy', async () => {
    const createResp = await gatewayApiClient.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'GW Delete Test', path: '/tmp/gw-delete' }),
    });
    const created = await createResp.json();
    const id = created.data.id;

    const resp = await gatewayApiClient.fetch(`/api/projects/${id}`, { method: 'DELETE' });
    expect(resp.status).toBe(200);
  });

  test('401 when invalid gateway secret', async () => {
    const resp = await fetch('http://localhost:3200/api/proxy/some-backend/api/projects', {
      headers: { 'Authorization': `Bearer wrong-secret:${apiKey}` },
    });
    expect(resp.status).toBe(401);
  });

  test('401 when invalid backend apiKey', async () => {
    const resp = await fetch(
      `http://localhost:3200/api/proxy/${gatewayApiClient.backendId}/api/projects`,
      {
        headers: { 'Authorization': 'Bearer test-secret-my-claudia-2026:invalid-api-key' },
      }
    );
    expect(resp.status).toBe(401);
  });

  test('502 when non-existent backendId', async () => {
    const resp = await fetch('http://localhost:3200/api/proxy/non-existent-backend/api/projects', {
      headers: { 'Authorization': `Bearer test-secret-my-claudia-2026:${apiKey}` },
    });
    expect(resp.status).toBe(502);
  });

  test('compound auth header format: Bearer gw_secret:api_key', async () => {
    const resp = await fetch(
      `http://localhost:3200/api/proxy/${gatewayApiClient.backendId}/api/projects`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer test-secret-my-claudia-2026:${apiKey}`,
        },
      }
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
  });
});
