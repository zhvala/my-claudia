import { useCallback } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import type { BackendServer } from '@my-claudia/shared';

/**
 * Hook for managing server configurations (add/update/delete)
 * Only available when connected to a local server
 */
export function useServerManager() {
  const { sendMessage } = useConnection();

  const addServer = useCallback(
    (server: Omit<BackendServer, 'id' | 'createdAt' | 'requiresAuth' | 'lastConnected'>) => {
      sendMessage({
        type: 'add_server',
        server
      });
    },
    [sendMessage]
  );

  const updateServer = useCallback(
    (id: string, updates: Partial<Omit<BackendServer, 'id' | 'createdAt'>>) => {
      sendMessage({
        type: 'update_server',
        id,
        server: updates
      });
    },
    [sendMessage]
  );

  const deleteServer = useCallback(
    (id: string) => {
      sendMessage({
        type: 'delete_server',
        id
      });
    },
    [sendMessage]
  );

  const setDefaultServer = useCallback(
    (id: string) => {
      sendMessage({
        type: 'update_server',
        id,
        server: { isDefault: true }
      });
    },
    [sendMessage]
  );

  return {
    addServer,
    updateServer,
    deleteServer,
    setDefaultServer
  };
}
