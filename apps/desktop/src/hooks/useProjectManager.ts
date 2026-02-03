import { useCallback } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import type { Project } from '@my-claudia/shared';

/**
 * Hook for managing project configurations (add/update/delete)
 * Only available when connected to a local server
 */
export function useProjectManager() {
  const { sendMessage } = useConnection();

  const addProject = useCallback(
    (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      sendMessage({
        type: 'add_project',
        project
      });
    },
    [sendMessage]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>) => {
      sendMessage({
        type: 'update_project',
        id,
        project: updates
      });
    },
    [sendMessage]
  );

  const deleteProject = useCallback(
    (id: string) => {
      sendMessage({
        type: 'delete_project',
        id
      });
    },
    [sendMessage]
  );

  return {
    addProject,
    updateProject,
    deleteProject
  };
}
