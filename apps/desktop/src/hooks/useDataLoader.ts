import { useEffect, useCallback } from 'react';
import { useServerStore } from '../stores/serverStore';
import { useConnection } from '../contexts/ConnectionContext';

export function useDataLoader() {
  const { connectionStatus, activeServerId, isLocalConnection } = useServerStore();
  const { sendMessage } = useConnection();

  const loadData = useCallback(() => {
    if (connectionStatus !== 'connected') return;

    console.log('[DataLoader] Loading data, isLocalConnection:', isLocalConnection);

    // Always load servers list (client-side configuration)
    sendMessage({ type: 'get_servers' });

    // Load projects and sessions for local connections
    // Also load if isLocalConnection is null (initial state) or true
    // Only skip for explicitly remote connections (isLocalConnection === false)
    if (isLocalConnection !== false) {
      console.log('[DataLoader] Loading projects and sessions');
      sendMessage({ type: 'get_projects' });
      sendMessage({ type: 'get_sessions' });
    } else {
      console.log('[DataLoader] Skipping projects/sessions load - remote connection');
    }
  }, [connectionStatus, isLocalConnection, sendMessage]);

  // Load data when connected, server changes, or isLocalConnection changes
  useEffect(() => {
    console.log('[DataLoader] useEffect triggered, connectionStatus:', connectionStatus, 'isLocalConnection:', isLocalConnection);

    // Add a small delay to ensure WebSocket is fully ready
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
