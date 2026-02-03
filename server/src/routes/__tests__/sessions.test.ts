import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createSessionRoutes } from '../sessions.js';

// Create in-memory database for testing
function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('chat_only', 'code')) DEFAULT 'code',
      provider_id TEXT,
      root_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT,
      provider_id TEXT,
      sdk_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function createTestApp(db: Database.Database) {
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', createSessionRoutes(db));
  return app;
}

describe('sessions routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof express>;

  beforeAll(() => {
    db = createTestDb();
    app = createTestApp(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    // Clear all data before each test
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM sessions');
    db.exec('DELETE FROM projects');

    // Create a test project
    const now = Date.now();
    db.prepare(`
      INSERT INTO projects (id, name, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('project-1', 'Test Project', 'code', now, now);
  });

  describe('GET /api/sessions', () => {
    it('returns empty array when no sessions exist', async () => {
      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('returns all sessions', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Session 1', now, now);
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s2', 'project-1', 'Session 2', now + 1000, now + 1000);

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('filters by projectId when provided', async () => {
      const now = Date.now();
      // Create another project
      db.prepare(`
        INSERT INTO projects (id, name, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('project-2', 'Another Project', 'code', now, now);

      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Session 1', now, now);
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s2', 'project-2', 'Session 2', now, now);

      const res = await request(app).get('/api/sessions?projectId=project-1');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].projectId).toBe('project-1');
    });

    it('orders by updated_at DESC', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Older', now, now);
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s2', 'project-1', 'Newer', now, now + 1000);

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(200);
      expect(res.body.data[0].name).toBe('Newer');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('returns session by id', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, sdk_session_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Test Session', 'sdk-123', now, now);

      const res = await request(app).get('/api/sessions/s1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('s1');
      expect(res.body.data.name).toBe('Test Session');
      expect(res.body.data.sdkSessionId).toBe('sdk-123');
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app).get('/api/sessions/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/sessions', () => {
    it('creates session with projectId', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ projectId: 'project-1', name: 'New Session' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.projectId).toBe('project-1');
      expect(res.body.data.name).toBe('New Session');
      expect(res.body.data.id).toBeDefined();
    });

    it('returns 400 when projectId missing', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ name: 'New Session' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when project does not exist', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .send({ projectId: 'nonexistent' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Project not found');
    });
  });

  describe('PUT /api/sessions/:id', () => {
    it('updates session fields', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Original', now, now);

      const res = await request(app)
        .put('/api/sessions/s1')
        .send({ name: 'Updated', sdkSessionId: 'sdk-456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify update
      const row = db.prepare('SELECT name, sdk_session_id FROM sessions WHERE id = ?').get('s1') as { name: string; sdk_session_id: string };
      expect(row.name).toBe('Updated');
      expect(row.sdk_session_id).toBe('sdk-456');
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .put('/api/sessions/nonexistent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('deletes session', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'To Delete', now, now);

      const res = await request(app).delete('/api/sessions/s1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('s1');
      expect(row).toBeUndefined();
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app).delete('/api/sessions/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/sessions/:id/messages', () => {
    beforeEach(() => {
      const now = Date.now();
      // Create a session for message tests
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Test Session', now, now);
    });

    it('returns messages with pagination info', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('m1', 's1', 'user', 'Hello', now);

      const res = await request(app).get('/api/sessions/s1/messages');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.messages).toHaveLength(1);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(1);
    });

    it('limits results to specified limit', async () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO messages (id, session_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(`m${i}`, 's1', 'user', `Message ${i}`, now + i);
      }

      const res = await request(app).get('/api/sessions/s1/messages?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.data.messages).toHaveLength(5);
      expect(res.body.data.pagination.hasMore).toBe(true);
    });

    it('returns messages in chronological order', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('m1', 's1', 'user', 'First', now);
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('m2', 's1', 'assistant', 'Second', now + 1000);
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('m3', 's1', 'user', 'Third', now + 2000);

      const res = await request(app).get('/api/sessions/s1/messages');

      expect(res.status).toBe(200);
      expect(res.body.data.messages[0].content).toBe('First');
      expect(res.body.data.messages[1].content).toBe('Second');
      expect(res.body.data.messages[2].content).toBe('Third');
    });

    it('paginates with before cursor', async () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO messages (id, session_id, role, content, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(`m${i}`, 's1', 'user', `Message ${i}`, now + i * 1000);
      }

      // Get messages before timestamp of message 5
      const beforeTimestamp = now + 5000;
      const res = await request(app).get(`/api/sessions/s1/messages?before=${beforeTimestamp}&limit=3`);

      expect(res.status).toBe(200);
      expect(res.body.data.messages).toHaveLength(3);
      // Should get messages 2, 3, 4 (the 3 most recent before message 5)
      expect(res.body.data.messages[0].content).toBe('Message 2');
    });

    it('calculates hasMore correctly', async () => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('m1', 's1', 'user', 'Only one', now);

      const res = await request(app).get('/api/sessions/s1/messages?limit=50');

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.hasMore).toBe(false);
    });
  });

  describe('POST /api/sessions/:id/messages', () => {
    beforeEach(() => {
      const now = Date.now();
      db.prepare(`
        INSERT INTO sessions (id, project_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('s1', 'project-1', 'Test Session', now, now);
    });

    it('creates message', async () => {
      const res = await request(app)
        .post('/api/sessions/s1/messages')
        .send({ role: 'user', content: 'Hello!' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('user');
      expect(res.body.data.content).toBe('Hello!');
      expect(res.body.data.sessionId).toBe('s1');
    });

    it('updates session updated_at', async () => {
      const beforeUpdate = db.prepare('SELECT updated_at FROM sessions WHERE id = ?').get('s1') as { updated_at: number };

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post('/api/sessions/s1/messages')
        .send({ role: 'user', content: 'Hello!' });

      const afterUpdate = db.prepare('SELECT updated_at FROM sessions WHERE id = ?').get('s1') as { updated_at: number };
      expect(afterUpdate.updated_at).toBeGreaterThan(beforeUpdate.updated_at);
    });

    it('returns 400 when role or content missing', async () => {
      const res1 = await request(app)
        .post('/api/sessions/s1/messages')
        .send({ content: 'Hello!' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/sessions/s1/messages')
        .send({ role: 'user' });
      expect(res2.status).toBe(400);
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .post('/api/sessions/nonexistent/messages')
        .send({ role: 'user', content: 'Hello!' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('stores metadata as JSON', async () => {
      const metadata = { tokenCount: 100, model: 'claude' };
      const res = await request(app)
        .post('/api/sessions/s1/messages')
        .send({ role: 'user', content: 'Hello!', metadata });

      expect(res.status).toBe(201);

      // Verify in database
      const row = db.prepare('SELECT metadata FROM messages WHERE id = ?').get(res.body.data.id) as { metadata: string };
      expect(JSON.parse(row.metadata)).toEqual(metadata);
    });
  });
});
