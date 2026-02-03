import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string; // base64
  createdAt: number;
}

class FileStore {
  private files = new Map<string, StoredFile>();
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    // Ensure storage directory exists
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
  }

  // Store file and return fileId
  storeFile(name: string, mimeType: string, data: string): string {
    const fileId = uuidv4();
    const file: StoredFile = {
      id: fileId,
      name,
      mimeType,
      size: Buffer.from(data, 'base64').length,
      data,
      createdAt: Date.now()
    };

    this.files.set(fileId, file);

    // Optionally persist to disk for large files
    // Uncomment below to enable disk persistence
    // try {
    //   fs.writeFileSync(path.join(this.storageDir, fileId), data);
    // } catch (error) {
    //   console.error('[FileStore] Failed to persist file to disk:', error);
    // }

    console.log(`[FileStore] Stored file ${fileId} (${name}, ${file.size} bytes)`);

    return fileId;
  }

  // Retrieve file by ID
  getFile(fileId: string): StoredFile | null {
    const file = this.files.get(fileId);

    if (!file) {
      // Try to load from disk if not in memory
      // Uncomment below if disk persistence is enabled
      // try {
      //   const filePath = path.join(this.storageDir, fileId);
      //   if (fs.existsSync(filePath)) {
      //     const data = fs.readFileSync(filePath, 'utf-8');
      //     // Reconstruct file object - would need to store metadata separately
      //     // This is a simplified version
      //   }
      // } catch (error) {
      //   console.error('[FileStore] Failed to load file from disk:', error);
      // }

      console.log(`[FileStore] File ${fileId} not found`);
      return null;
    }

    console.log(`[FileStore] Retrieved file ${fileId} (${file.name})`);
    return file;
  }

  // Delete file by ID
  deleteFile(fileId: string): boolean {
    const deleted = this.files.delete(fileId);

    // Remove from disk if disk persistence is enabled
    // Uncomment below if disk persistence is enabled
    // try {
    //   const filePath = path.join(this.storageDir, fileId);
    //   if (fs.existsSync(filePath)) {
    //     fs.unlinkSync(filePath);
    //   }
    // } catch (error) {
    //   console.error('[FileStore] Failed to delete file from disk:', error);
    // }

    if (deleted) {
      console.log(`[FileStore] Deleted file ${fileId}`);
    }

    return deleted;
  }

  // Cleanup old files (> 24 hours)
  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let deletedCount = 0;

    for (const [id, file] of this.files.entries()) {
      if (now - file.createdAt > maxAge) {
        this.deleteFile(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[FileStore] Cleanup: deleted ${deletedCount} old files`);
    }
  }

  // Get statistics
  getStats() {
    const count = this.files.size;
    let totalSize = 0;

    for (const file of this.files.values()) {
      totalSize += file.size;
    }

    return {
      count,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    };
  }
}

// Create singleton instance
export const fileStore = new FileStore('./data/files');

// Cleanup every hour
setInterval(() => {
  fileStore.cleanup();
}, 60 * 60 * 1000);

// Log stats on startup
const stats = fileStore.getStats();
console.log(`[FileStore] Initialized: ${stats.count} files, ${stats.totalSizeMB} MB`);
