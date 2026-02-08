import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// API Key storage path
const AUTH_CONFIG_DIR = path.join(os.homedir(), '.my-claudia');
const AUTH_CONFIG_PATH = path.join(AUTH_CONFIG_DIR, 'auth.json');

interface AuthConfig {
  apiKey: string;
  createdAt: number;
  lastRotatedAt?: number;
}

// Ensure config directory exists
function ensureConfigDir(): void {
  if (!fs.existsSync(AUTH_CONFIG_DIR)) {
    fs.mkdirSync(AUTH_CONFIG_DIR, { recursive: true });
  }
}

/**
 * Generate a random API Key with prefix
 * Format: mca_xxxxxxxxxxxx (my-claudia-api-key)
 */
export function generateApiKey(): string {
  return `mca_${crypto.randomBytes(32).toString('base64url')}`;
}

/**
 * Load existing API Key or create a new one
 * On first run, displays the generated key in console
 */
export function loadOrCreateApiKey(): string {
  ensureConfigDir();

  if (fs.existsSync(AUTH_CONFIG_PATH)) {
    try {
      const config: AuthConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
      return config.apiKey;
    } catch (error) {
      console.error('Failed to read auth config, generating new key:', error);
    }
  }

  // First time startup - generate new key
  const apiKey = generateApiKey();
  const config: AuthConfig = {
    apiKey,
    createdAt: Date.now()
  };
  fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('🔑 New API Key generated for remote access:');
  console.log(`\n   ${apiKey}\n`);
  console.log('Save this key - you will need it to connect from other devices.');
  console.log('Config stored at:', AUTH_CONFIG_PATH);
  console.log('='.repeat(60) + '\n');

  return apiKey;
}

/**
 * Regenerate API Key (invalidates old key)
 */
export function regenerateApiKey(): string {
  ensureConfigDir();

  const newApiKey = generateApiKey();
  const config: AuthConfig = {
    apiKey: newApiKey,
    createdAt: Date.now(),
    lastRotatedAt: Date.now()
  };
  fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('\n🔄 API Key regenerated. Old key is now invalid.');
  console.log(`New key: ${newApiKey}\n`);

  return newApiKey;
}

/**
 * Get masked API Key for display (shows prefix and last 8 chars)
 */
export function getMaskedApiKey(): string {
  if (!fs.existsSync(AUTH_CONFIG_PATH)) {
    return '';
  }
  try {
    const config: AuthConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
    const key = config.apiKey;
    // Show prefix and last 8 chars: mca_****xxxxxxxx
    if (key.length > 12) {
      return key.slice(0, 4) + '****' + key.slice(-8);
    }
    return '****';
  } catch {
    return '';
  }
}

/**
 * Get full API Key (only for local access)
 */
export function getFullApiKey(): string {
  if (!fs.existsSync(AUTH_CONFIG_PATH)) {
    return loadOrCreateApiKey();
  }
  try {
    const config: AuthConfig = JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
    return config.apiKey;
  } catch {
    return loadOrCreateApiKey();
  }
}

/**
 * Validate an API Key
 */
export function validateApiKey(key: string): boolean {
  const storedKey = getFullApiKey();
  if (typeof key !== 'string' || typeof storedKey !== 'string') return false;
  const bufA = Buffer.from(key);
  const bufB = Buffer.from(storedKey);
  if (bufA.length !== bufB.length) {
    // Compare against self to maintain constant time even on length mismatch
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Get the config path (for display in UI)
 */
export function getAuthConfigPath(): string {
  return AUTH_CONFIG_PATH;
}
