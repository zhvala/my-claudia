import { useEffect, useCallback } from 'react';
import { useServerStore } from '../stores/serverStore';
import { useProjectStore } from '../stores/projectStore';
import * as api from '../services/api';

export function useDataLoader() {
  const { connectionStatus, activeServerId } = useServerStore();

  // Track local server's apiKey to know when it's available for authenticated requests.
  // Data loading always targets the local server regardless of which server is active.
  const localApiKey = useServerStore(
    (s) => s.servers.find((srv) => srv.isDefault)?.apiKey
  );

  const loadData = useCallback(async () => {
    if (connectionStatus !== 'connected') return;

    // Wait for local server's API key to be available before making authenticated requests.
    // The API key is fetched asynchronously after WebSocket auth succeeds.
    if (!localApiKey) {
      console.log('[DataLoader] Waiting for local API key...');
      return;
    }

    console.log('[DataLoader] Loading data from local server via HTTP');

    try {
      // Load servers, projects, and sessions from the local server.
      // These API functions always target the local backend via fetchLocalApi.
      const [servers, projects, sessions] = await Promise.all([
        api.getServers(),
        api.getProjects(),
        api.getSessions()
      ]);
      useServerStore.getState().setServers(servers);
      useProjectStore.getState().setProjects(projects);
      useProjectStore.getState().setSessions(sessions);
    } catch (err) {
      console.error('[DataLoader] Error loading data:', err);
    }
  }, [connectionStatus, localApiKey]);

  // Load data when connected, server changes, or local apiKey becomes available
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const timer = setTimeout(() => {
        loadData();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loadData, activeServerId, connectionStatus, localApiKey]);

  // Note: Session messages are loaded by ChatInterface with pagination support

  return {
    loadData
  };
}
