import * as fs from 'fs';
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
  private totalSize = 0;
  private maxTotalSize: number;

  constructor(storageDir: string, maxTotalSizeMB = 100) {
    this.storageDir = storageDir;
    this.maxTotalSize = maxTotalSizeMB * 1024 * 1024;
    // Ensure storage directory exists
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
  }

  // Store file and return fileId
  storeFile(name: string, mimeType: string, data: string): string {
    const fileId = uuidv4();
    const fileSize = Buffer.from(data, 'base64').length;

    // Evict oldest files if adding this one would exceed the limit
    while (this.totalSize + fileSize > this.maxTotalSize && this.files.size > 0) {
      const oldest = this.findOldestFile();
      if (oldest) {
        console.log(`[FileStore] Evicting ${oldest.id} (${oldest.name}) to free space`);
        this.totalSize -= oldest.size;
        this.files.delete(oldest.id);
      } else {
        break;
      }
    }

    const file: StoredFile = {
      id: fileId,
      name,
      mimeType,
      size: fileSize,
      data,
      createdAt: Date.now()
    };

    this.files.set(fileId, file);
    this.totalSize += fileSize;

    console.log(`[FileStore] Stored file ${fileId} (${name}, ${file.size} bytes, total: ${(this.totalSize / 1024 / 1024).toFixed(1)}MB)`);

    return fileId;
  }

  private findOldestFile(): StoredFile | null {
    let oldest: StoredFile | null = null;
    for (const file of this.files.values()) {
      if (!oldest || file.createdAt < oldest.createdAt) {
        oldest = file;
      }
    }
    return oldest;
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
    const file = this.files.get(fileId);
    if (!file) return false;

    this.totalSize -= file.size;
    this.files.delete(fileId);
    console.log(`[FileStore] Deleted file ${fileId}`);
    return true;
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
    return {
      count: this.files.size,
      totalSize: this.totalSize,
      totalSizeMB: (this.totalSize / (1024 * 1024)).toFixed(2),
      maxSizeMB: (this.maxTotalSize / (1024 * 1024)).toFixed(0)
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
console.log(`[FileStore] Initialized: ${stats.count} files, ${stats.totalSizeMB}/${stats.maxSizeMB} MB`);
