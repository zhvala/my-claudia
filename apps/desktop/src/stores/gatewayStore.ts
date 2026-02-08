import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GatewayBackendInfo } from '@my-claudia/shared';

export type BackendAuthStatus = 'authenticated' | 'pending' | 'failed';

interface GatewayState {
  // Persisted config
  gatewayUrl: string | null;
  gatewaySecret: string | null;
  backendApiKeys: Record<string, string>; // backendId → apiKey

  // Runtime state (NOT persisted)
  isConnected: boolean;
  discoveredBackends: GatewayBackendInfo[];
  backendAuthStatus: Record<string, BackendAuthStatus>;

  // Actions
  setGatewayConfig: (url: string | null, secret: string | null) => void;
  setConnected: (connected: boolean) => void;
  setDiscoveredBackends: (backends: GatewayBackendInfo[]) => void;
  setBackendApiKey: (backendId: string, apiKey: string) => void;
  removeBackendApiKey: (backendId: string) => void;
  setBackendAuthStatus: (backendId: string, status: BackendAuthStatus) => void;
  clearGateway: () => void;

  // Getters
  getBackendApiKey: (backendId: string) => string | undefined;
  isConfigured: () => boolean;
}

export const useGatewayStore = create<GatewayState>()(
  persist(
    (set, get) => ({
      // Persisted config
      gatewayUrl: null,
      gatewaySecret: null,
      backendApiKeys: {},

      // Runtime state
      isConnected: false,
      discoveredBackends: [],
      backendAuthStatus: {},

      setGatewayConfig: (url, secret) => {
        set({
          gatewayUrl: url,
          gatewaySecret: secret,
          // Reset runtime state when config changes
          isConnected: false,
          discoveredBackends: [],
          backendAuthStatus: {}
        });
      },

      setConnected: (connected) => {
        set({ isConnected: connected });
        if (!connected) {
          // Clear runtime state on disconnect
          set({ discoveredBackends: [], backendAuthStatus: {} });
        }
      },

      setDiscoveredBackends: (backends) => {
        set({ discoveredBackends: backends });
      },

      setBackendApiKey: (backendId, apiKey) => {
        set((state) => ({
          backendApiKeys: { ...state.backendApiKeys, [backendId]: apiKey }
        }));
      },

      removeBackendApiKey: (backendId) => {
        set((state) => {
          const { [backendId]: _, ...rest } = state.backendApiKeys;
          return { backendApiKeys: rest };
        });
      },

      setBackendAuthStatus: (backendId, status) => {
        set((state) => ({
          backendAuthStatus: { ...state.backendAuthStatus, [backendId]: status }
        }));
      },

      clearGateway: () => {
        set({
          gatewayUrl: null,
          gatewaySecret: null,
          backendApiKeys: {},
          isConnected: false,
          discoveredBackends: [],
          backendAuthStatus: {}
        });
      },

      getBackendApiKey: (backendId) => {
        return get().backendApiKeys[backendId];
      },

      isConfigured: () => {
        const state = get();
        return !!state.gatewayUrl && !!state.gatewaySecret;
      }
    }),
    {
      name: 'my-claudia-gateway',
      partialize: (state) => ({
        gatewayUrl: state.gatewayUrl,
        gatewaySecret: state.gatewaySecret,
        backendApiKeys: state.backendApiKeys
      })
    }
  )
);

// Helper to construct a gateway-target serverId
export function toGatewayServerId(backendId: string): string {
  return `gw:${backendId}`;
}

// Helper to check if a serverId is a gateway target
export function isGatewayTarget(serverId: string | null): boolean {
  return !!serverId && serverId.startsWith('gw:');
}

// Helper to extract backendId from a gateway serverId
export function parseBackendId(serverId: string): string {
  return serverId.slice(3);
}
