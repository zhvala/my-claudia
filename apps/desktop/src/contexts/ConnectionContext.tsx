import { createContext, useContext, type ReactNode } from 'react';
import { useUnifiedSocket } from '../hooks/useUnifiedSocket';
import type { ClientMessage } from '@my-claudia/shared';

interface ConnectionContextValue {
  sendMessage: (message: ClientMessage) => void;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  // Use the unified socket hook that handles both direct and gateway modes
  const socket = useUnifiedSocket();

  const value: ConnectionContextValue = {
    sendMessage: socket.sendMessage,
    isConnected: socket.isConnected,
    connect: socket.connect,
    disconnect: socket.disconnect
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}
