import { useEffect, useCallback } from 'react';
import { useServerStore } from '../stores/serverStore';
import { useProjectStore } from '../stores/projectStore';
import * as api from '../services/api';

export function useDataLoader() {
  const { connectionStatus, activeServerId, isLocalConnection } = useServerStore();

  const loadData = useCallback(async () => {
    if (connectionStatus !== 'connected') return;

    console.log('[DataLoader] Loading data via HTTP, isLocalConnection:', isLocalConnection);

    try {
      // Always load servers list (client-side configuration, local only)
      // Servers are stored locally so only fetch in local mode
      if (isLocalConnection !== false) {
        const servers = await api.getServers();
        useServerStore.getState().setServers(servers);
      }

      // Load projects and sessions for local connections
      // Also load if isLocalConnection is null (initial state) or true
      // Only skip for explicitly remote connections (isLocalConnection === false)
      if (isLocalConnection !== false) {
        console.log('[DataLoader] Loading projects and sessions via HTTP');
        const [projects, sessions] = await Promise.all([
          api.getProjects(),
          api.getSessions()
        ]);
        useProjectStore.getState().setProjects(projects);
        useProjectStore.getState().setSessions(sessions);
      } else {
        console.log('[DataLoader] Skipping projects/sessions load - remote connection');
      }
    } catch (err) {
      console.error('[DataLoader] Error loading data:', err);
    }
  }, [connectionStatus, isLocalConnection]);

  // Load data when connected, server changes, or isLocalConnection changes
  useEffect(() => {
    console.log('[DataLoader] useEffect triggered, connectionStatus:', connectionStatus, 'isLocalConnection:', isLocalConnection);

    // Add a small delay to ensure connection is fully ready
    if (connectionStatus === 'connected') {
      const timer = setTimeout(() => {
        console.log('[DataLoader] Delayed load triggered');
        loadData();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loadData, activeServerId, isLocalConnection, connectionStatus]);

  // Note: Session messages are loaded by ChatInterface with pagination support

  return {
    loadData
  };
}
