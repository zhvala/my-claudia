import { useCallback } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import type { Session } from '@my-claudia/shared';

/**
 * Hook for managing session configurations (add/update/delete)
 * Only available when connected to a local server
 */
export function useSessionManager() {
  const { sendMessage } = useConnection();

  const addSession = useCallback(
    (session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>) => {
      sendMessage({
        type: 'add_session',
        session
      });
    },
    [sendMessage]
  );

  const updateSession = useCallback(
    (id: string, updates: Partial<Omit<Session, 'id' | 'createdAt' | 'updatedAt'>>) => {
      sendMessage({
        type: 'update_session',
        id,
        session: updates
      });
    },
    [sendMessage]
  );

  const deleteSession = useCallback(
    (id: string) => {
      sendMessage({
        type: 'delete_session',
        id
      });
    },
    [sendMessage]
  );

  return {
    addSession,
    updateSession,
    deleteSession
  };
}
