import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type { ProviderConfig, ApiResponse, SlashCommand } from '@my-claudia/shared';
import { LOCAL_COMMANDS, CLI_COMMANDS } from '@my-claudia/shared';
import { scanCustomCommands } from '../utils/command-scanner.js';

// Database row type (different from ProviderConfig due to SQLite types)
interface ProviderRow {
  id: string;
  name: string;
  type: string;
  cliPath: string | null;
  env: string | null;
  isDefault: number;
  createdAt: number;
  updatedAt: number;
}

export function createProviderRoutes(db: Database.Database): Router {
  const router = Router();

  // Get all providers
  router.get('/', (_req: Request, res: Response) => {
    try {
      const providers = db.prepare(`
        SELECT id, name, type, cli_path as cliPath, env,
               is_default as isDefault, created_at as createdAt, updated_at as updatedAt
        FROM providers
        ORDER BY is_default DESC, name ASC
      `).all() as ProviderRow[];

      const result: ProviderConfig[] = providers.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type as ProviderConfig['type'],
        cliPath: p.cliPath || undefined,
        env: p.env ? JSON.parse(p.env) : undefined,
        isDefault: p.isDefault === 1,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }));

      res.json({ success: true, data: result } as ApiResponse<ProviderConfig[]>);
    } catch (error) {
      console.error('Error fetching providers:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch providers' }
      });
    }
  });

  // Get single provider
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const row = db.prepare(`
        SELECT id, name, type, cli_path as cliPath, env,
               is_default as isDefault, created_at as createdAt, updated_at as updatedAt
        FROM providers WHERE id = ?
      `).get(req.params.id) as ProviderRow | undefined;

      if (!row) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' }
        });
        return;
      }

      const provider: ProviderConfig = {
        id: row.id,
        name: row.name,
        type: row.type as ProviderConfig['type'],
        cliPath: row.cliPath || undefined,
        env: row.env ? JSON.parse(row.env) : undefined,
        isDefault: row.isDefault === 1,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };

      res.json({
        success: true,
        data: provider
      } as ApiResponse<ProviderConfig>);
    } catch (error) {
      console.error('Error fetching provider:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch provider' }
      });
    }
  });

  // Create provider
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, type = 'claude', cliPath, env, isDefault } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Name is required' }
        });
        return;
      }

      const id = uuidv4();
      const now = Date.now();

      // If this provider is default, unset other defaults
      if (isDefault) {
        db.prepare('UPDATE providers SET is_default = 0').run();
      }

      db.prepare(`
        INSERT INTO providers (id, name, type, cli_path, env, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name,
        type,
        cliPath || null,
        env ? JSON.stringify(env) : null,
        isDefault ? 1 : 0,
        now,
        now
      );

      const provider: ProviderConfig = {
        id,
        name,
        type,
        cliPath,
        env,
        isDefault: isDefault || false,
        createdAt: now,
        updatedAt: now
      };

      res.status(201).json({ success: true, data: provider } as ApiResponse<ProviderConfig>);
    } catch (error) {
      console.error('Error creating provider:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to create provider' }
      });
    }
  });

  // Update provider
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const { name, type, cliPath, env, isDefault } = req.body;
      const now = Date.now();

      // If this provider is becoming default, unset other defaults
      if (isDefault) {
        db.prepare('UPDATE providers SET is_default = 0 WHERE id != ?').run(req.params.id);
      }

      const result = db.prepare(`
        UPDATE providers
        SET name = COALESCE(?, name),
            type = COALESCE(?, type),
            cli_path = ?,
            env = ?,
            is_default = COALESCE(?, is_default),
            updated_at = ?
        WHERE id = ?
      `).run(
        name || null,
        type || null,
        cliPath !== undefined ? cliPath : null,
        env ? JSON.stringify(env) : null,
        isDefault !== undefined ? (isDefault ? 1 : 0) : null,
        now,
        req.params.id
      );

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' }
        });
        return;
      }

      res.json({ success: true } as ApiResponse<void>);
    } catch (error) {
      console.error('Error updating provider:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to update provider' }
      });
    }
  });

  // Delete provider
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const result = db.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id);

      if (result.changes === 0) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' }
        });
        return;
      }

      res.json({ success: true } as ApiResponse<void>);
    } catch (error) {
      console.error('Error deleting provider:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to delete provider' }
      });
    }
  });

  // Get commands for a provider
  // Query params: ?projectRoot=<path> - optional, to include project-level custom commands
  // Note: We only return LOCAL_COMMANDS + custom commands, not provider commands
  // (provider commands like /compact, /login, /mcp are used in CLI directly)
  router.get('/:id/commands', (req: Request, res: Response) => {
    try {
      const row = db.prepare('SELECT type FROM providers WHERE id = ?').get(req.params.id) as { type: string } | undefined;

      if (!row) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' }
        });
        return;
      }

      // Scan custom commands (global + project if projectRoot provided)
      const projectRoot = req.query.projectRoot as string | undefined;
      const customCommands = scanCustomCommands({ projectRoot });

      // Combine: local + CLI pass-through + custom commands
      const allCommands: SlashCommand[] = [
        ...LOCAL_COMMANDS,
        ...CLI_COMMANDS,
        ...customCommands
      ];

      res.json({ success: true, data: allCommands } as ApiResponse<SlashCommand[]>);
    } catch (error) {
      console.error('Error fetching provider commands:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to fetch provider commands' }
      });
    }
  });

  // Get commands for a provider type (without needing a provider ID)
  // Query params: ?projectRoot=<path> - optional, to include project-level custom commands
  // Note: We only return LOCAL_COMMANDS + custom commands, not provider commands
  router.get('/type/:type/commands', (req: Request, res: Response) => {
    try {
      // Scan custom commands (global + project if projectRoot provided)
      const projectRoot = req.query.projectRoot as string | undefined;
      const customCommands = scanCustomCommands({ projectRoot });

      // Combine: local + CLI pass-through + custom commands
      const allCommands: SlashCommand[] = [
        ...LOCAL_COMMANDS,
        ...CLI_COMMANDS,
        ...customCommands
      ];

      res.json({ success: true, data: allCommands } as ApiResponse<SlashCommand[]>);
    } catch (error) {
      console.error('Error fetching provider type commands:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch provider type commands' }
      });
    }
  });

  // Set provider as default
  router.post('/:id/set-default', (req: Request, res: Response) => {
    try {
      // Verify provider exists
      const provider = db.prepare('SELECT id FROM providers WHERE id = ?').get(req.params.id);
      if (!provider) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Provider not found' }
        });
        return;
      }

      const now = Date.now();

      // Unset all defaults
      db.prepare('UPDATE providers SET is_default = 0, updated_at = ?').run(now);

      // Set this provider as default
      db.prepare('UPDATE providers SET is_default = 1, updated_at = ? WHERE id = ?').run(
        now,
        req.params.id
      );

      res.json({ success: true } as ApiResponse<void>);
    } catch (error) {
      console.error('Error setting default provider:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: 'Failed to set default provider' }
      });
    }
  });

  return router;
}
