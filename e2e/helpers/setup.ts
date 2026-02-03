import { test as base } from '@playwright/test';
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const test = base.extend({
  // Clean database before each test
  cleanDB: async ({}, use) => {
    const dbPath = path.join(__dirname, '../../server/data/my-claudia.db');

    // Check if database exists, if not skip cleanup
    try {
      const db = new Database(dbPath);

      // Check if tables exist before cleaning
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
    const dbPath = path.join(__dirname, '../../server/data/my-claudia.db');
    const db = new Database(dbPath);

    const projectId = 'test-project-' + Date.now();
    db.prepare(`
      INSERT INTO projects (id, name, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, 'Test Project', '/test/path', Date.now(), Date.now());

    db.close();

    await use(projectId);
  }
});

export { expect } from '@playwright/test';
