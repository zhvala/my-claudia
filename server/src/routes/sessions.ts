import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type { Session, Message, ApiResponse } from '@my-claudia/shared';

export function createSessionRoutes(db: Database.Database): Router {
  const router = Router();

  // Get all sessions (optionally filtered by project)
  router.get('/', (req: Request, res: Response) => {
    try {
      const { projectId } = req.query;

      let query = `
        SELECT id, project_id as projectId, name, provider_id as providerId,
               sdk_session_id as sdkSessionId, created_at as createdAt, updated_at as updatedAt
        FROM sessions
      `;

      const params: string[] = [];

      if (projectId) {
        query += ' WHERE project_id = ?';
        params.push(projectId as string);
      }

      query += ' ORDER BY updated_at DESC';

      const sessions = db.prepare(query).all(...params) as Session[];

      res.json({ success: true, data: sessions } as ApiResponse<Session[]>);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch sessions' }
      });
    }
  });

  // Get single session
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const session = db.prepare(`
        SELECT id, project_id as projectId, name, provider_id as providerId,
               sdk_session_id as sdkSessionId, created_at as createdAt, updated_at as updatedAt
        FROM sessions WHERE id = ?
      `).get(req.params.id) as Session | undefined;

      if (!session) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        });
        return;
      }

      res.json({ success: true, data: session } as ApiResponse<Session>);
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch session' }
      });
    }
  });

  // Create session
  router.post('/', (req: Request, res: Response) => {
    try {
      const { projectId, name, providerId } = req.body;

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' }
        });
        return;
      }

      // Verify project exists
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
      if (!project) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Project not found' }
        });
        return;
      }

      const id = uuidv4();
      const now = Date.now();

      db.prepare(`
        INSERT INTO sessions (id, project_id, name, provider_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, projectId, name || null, providerId || null, now, now);

      const session: Session = {
        id,
        projectId,
        name,
        providerId,
        createdAt: now,
        updatedAt: now
      };

      res.status(201).json({ success: true, data: session } as ApiResponse<Session>);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to create session' }
      });
    }
  });

  // Update session
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { name, providerId, sdkSessionId } = req.body;
      const now = Date.now();

      const result = db.prepare(`
        UPDATE sessions
        SET name = COALESCE(?, name),
            provider_id = COALESCE(?, provider_id),
            sdk_session_id = COALESCE(?, sdk_session_id),
            updated_at = ?
        WHERE id = ?
      `).run(name || null, providerId || null, sdkSessionId || null, now, req.params.id);

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        });
        return;
      }

      res.json({ success: true } as ApiResponse<void>);
    } catch (error) {
      console.error('Error updating session:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to update session' }
      });
    }
  });

  // Delete session
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        });
        return;
      }

      res.json({ success: true } as ApiResponse<void>);
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to delete session' }
      });
    }
  });

  // Get messages for a session (with pagination support)
  // Query params:
  //   - limit: number of messages to fetch (default: 50)
  //   - before: cursor - fetch messages before this timestamp (for loading older messages)
  //   - after: cursor - fetch messages after this timestamp (for loading newer messages)
  router.get('/:id/messages', (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const before = req.query.before ? parseInt(req.query.before as string) : undefined;
      const after = req.query.after ? parseInt(req.query.after as string) : undefined;

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
        params = [req.params.id, before, limit];
      } else if (after) {
        // Load newer messages (after cursor) - for scrolling down or new messages
        query = `
          SELECT id, session_id as sessionId, role, content, metadata, created_at as createdAt
          FROM messages
          WHERE session_id = ? AND created_at > ?
          ORDER BY created_at ASC
          LIMIT ?
        `;
        params = [req.params.id, after, limit];
      } else {
        // Initial load - get the most recent messages
        query = `
          SELECT id, session_id as sessionId, role, content, metadata, created_at as createdAt
          FROM messages
          WHERE session_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `;
        params = [req.params.id, limit];
      }

      const messages = db.prepare(query).all(...params) as Array<Message & { metadata: string }>;

      // For initial load and "before" queries, we fetched DESC, so reverse to get chronological order
      if (!after) {
        messages.reverse();
      }

      const result = messages.map(m => ({
        ...m,
        metadata: m.metadata ? JSON.parse(m.metadata) : undefined
      }));

      // Get total count for this session
      const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM messages WHERE session_id = ?
      `).get(req.params.id) as { total: number };

      // Check if there are more messages
      const hasMore = before || after
        ? result.length === limit
        : countResult.total > limit;

      // Get the oldest message timestamp in this batch for cursor
      const oldestTimestamp = result.length > 0 ? result[0].createdAt : undefined;
      const newestTimestamp = result.length > 0 ? result[result.length - 1].createdAt : undefined;

      res.json({
        success: true,
        data: {
          messages: result,
          pagination: {
            total: countResult.total,
            hasMore,
            oldestTimestamp,
            newestTimestamp
          }
        }
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch messages' }
      });
    }
  });

  // Add message to session
  router.post('/:id/messages', (req: Request, res: Response) => {
    try {
      const { role, content, metadata } = req.body;

      if (!role || !content) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Role and content are required' }
        });
        return;
      }

      // Verify session exists
      const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
      if (!session) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        });
        return;
      }

      const id = uuidv4();
      const now = Date.now();

      db.prepare(`
        INSERT INTO messages (id, session_id, role, content, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, req.params.id, role, content, metadata ? JSON.stringify(metadata) : null, now);

      // Update session updated_at
      db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, req.params.id);

      const message: Message = {
        id,
        sessionId: req.params.id,
        role,
        content,
        metadata,
        createdAt: now
      };

      res.status(201).json({ success: true, data: message } as ApiResponse<Message>);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to create message' }
      });
    }
  });

  return router;
}
