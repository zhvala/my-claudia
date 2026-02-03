import { create } from 'zustand';
import type { BackendServer } from '@my-claudia/shared';

interface ServerState {
  servers: BackendServer[];
  activeServerId: string | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  connectionError: string | null;
  isLocalConnection: boolean | null;  // Determined by backend based on actual connection IP

  // Actions
  setServers: (servers: BackendServer[]) => void;
  setActiveServer: (id: string | null) => void;
  setConnectionStatus: (status: ServerState['connectionStatus'], error?: string) => void;
  setIsLocalConnection: (isLocal: boolean | null) => void;
  updateLastConnected: (id: string) => void;
  setApiKey: (serverId: string, apiKey: string) => void;

  // Getters
  getActiveServer: () => BackendServer | undefined;
  getDefaultServer: () => BackendServer | undefined;
}

// Note: Server list is now loaded from database via WebSocket
// The default local server is created in the database migration
const INITIAL_ACTIVE_SERVER = 'local';

// Hardcoded default server for initial connection
// This will be replaced by the server list from database once connected
const DEFAULT_SERVER: BackendServer = {
  id: 'local',
  name: 'Local Server',
  address: 'localhost:3100',
  isDefault: true,
  createdAt: Date.now()
};

export const useServerStore = create<ServerState>()((set, get) => ({
  servers: [DEFAULT_SERVER],
  activeServerId: INITIAL_ACTIVE_SERVER,
  connectionStatus: 'disconnected',
  connectionError: null,
  isLocalConnection: null,

  setServers: (servers) => {
    // Guard against undefined or null
    if (!servers || !Array.isArray(servers)) {
      console.warn('[ServerStore] setServers called with invalid data:', servers);
      return;
    }

    const state = get();

    // Merge with existing servers to preserve runtime data (like apiKey)
    const mergedServers = servers.map(newServer => {
      const existingServer = state.servers.find(s => s.id === newServer.id);
      // If server exists in memory and has an apiKey, preserve it
      if (existingServer?.apiKey && !newServer.apiKey) {
        console.log(`[ServerStore] Preserving API key for server: ${newServer.id}`);
        return { ...newServer, apiKey: existingServer.apiKey };
      }
      return newServer;
    });

    set({ servers: mergedServers });

    // If active server is not in the list, set to default or first server
    if (mergedServers.length > 0 && !mergedServers.find(s => s.id === state.activeServerId)) {
      const defaultServer = mergedServers.find(s => s.isDefault);
      const firstServer = mergedServers[0];
      set({ activeServerId: defaultServer?.id || firstServer?.id || null });
    }
  },

  setActiveServer: (id) => {
    set({
      activeServerId: id,
      connectionStatus: 'disconnected',
      connectionError: null,
      isLocalConnection: null
    });
  },

  setConnectionStatus: (status, error) => {
    set({ connectionStatus: status, connectionError: error || null });
  },

  setIsLocalConnection: (isLocal) => {
    set({ isLocalConnection: isLocal });
  },

  updateLastConnected: (id) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, lastConnected: Date.now() } : s
      )
    }));
  },

  getActiveServer: () => {
    const state = get();
    return state.servers.find((s) => s.id === state.activeServerId);
  },

  getDefaultServer: () => {
    const state = get();
    return state.servers.find((s) => s.isDefault);
  },

  setApiKey: (serverId, apiKey) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === serverId ? { ...s, apiKey } : s
      )
    }));
  }
}));
