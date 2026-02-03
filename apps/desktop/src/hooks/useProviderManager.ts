import { useCallback } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import type { ProviderConfig } from '@my-claudia/shared';

/**
 * Hook for managing provider configurations (add/update/delete)
 * Only available when connected to a local server
 */
export function useProviderManager() {
  const { sendMessage } = useConnection();

  const addProvider = useCallback(
    (provider: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      sendMessage({
        type: 'add_provider',
        provider
      });
    },
    [sendMessage]
  );

  const updateProvider = useCallback(
    (id: string, updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>>) => {
      sendMessage({
        type: 'update_provider',
        id,
        provider: updates
      });
    },
    [sendMessage]
  );

  const deleteProvider = useCallback(
    (id: string) => {
      sendMessage({
        type: 'delete_provider',
        id
      });
    },
    [sendMessage]
  );

  return {
    addProvider,
    updateProvider,
    deleteProvider
  };
}
