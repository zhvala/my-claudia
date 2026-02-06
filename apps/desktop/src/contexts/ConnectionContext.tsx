import { createContext, useContext, type ReactNode } from 'react';
import { useMultiServerSocket } from '../hooks/useMultiServerSocket';
import type { ClientMessage } from '@my-claudia/shared';

interface ConnectionContextValue {
  // Active server operations (backward compatible)
  sendMessage: (message: ClientMessage) => void;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;

  // Multi-server operations
  connectServer: (serverId: string) => void;
  disconnectServer: (serverId: string) => void;
  sendToServer: (serverId: string, message: ClientMessage) => void;
  isServerConnected: (serverId: string) => boolean;
  getConnectedServers: () => string[];
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  // Use the multi-server socket hook that manages multiple connections
  const socket = useMultiServerSocket();

  const value: ConnectionContextValue = {
    // Active server operations
    sendMessage: socket.sendMessage,
    isConnected: socket.isConnected,
    connect: socket.connect,
    disconnect: socket.disconnect,

    // Multi-server operations
    connectServer: socket.connectServer,
    disconnectServer: socket.disconnectServer,
    sendToServer: socket.sendToServer,
    isServerConnected: socket.isServerConnected,
    getConnectedServers: socket.getConnectedServers
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
