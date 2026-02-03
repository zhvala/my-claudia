import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/chat/ChatInterface';
import { ServerSelector } from './components/ServerSelector';
import { PermissionModal } from './components/permission/PermissionModal';
import { ThemeProvider } from './contexts/ThemeContext';
import { ConnectionProvider, useConnection } from './contexts/ConnectionContext';
import { useDataLoader } from './hooks/useDataLoader';
import { useServerManager } from './hooks/useServerManager';
import { useServerStore } from './stores/serverStore';
import { useProjectStore } from './stores/projectStore';
import { usePermissionStore } from './stores/permissionStore';
import { useIsMobile } from './hooks/useMediaQuery';
import { migrateServersFromLocalStorage, needsMigration } from './utils/migrateServers';

function AppContent() {
  const { sendMessage } = useConnection();
  const { addServer } = useServerManager();
  const { connectionStatus } = useServerStore();
  const { selectedSessionId } = useProjectStore();
  const { pendingRequest, clearRequest } = usePermissionStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const migrationDone = useRef(false);

  // Load data from server
  useDataLoader();

  // One-time migration from localStorage to database
  useEffect(() => {
    if (connectionStatus === 'connected' && !migrationDone.current && needsMigration()) {
      migrationDone.current = true;
      migrateServersFromLocalStorage(addServer).then(count => {
        if (count > 0) {
          console.log(`[App] Successfully migrated ${count} servers from localStorage to database`);
        }
      });
    }
  }, [connectionStatus, addServer]);

  // Note: Connection is automatically managed by useWebSocket/useGatewaySocket hooks
  // No need to manually call connect() here

  const handlePermissionDecision = useCallback(
    (requestId: string, allow: boolean, remember?: boolean) => {
      sendMessage({
        type: 'permission_decision',
        requestId,
        allow,
        remember
      });
      clearRequest();
    },
    [sendMessage, clearRequest]
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header with Server Selector */}
        <header className="h-12 border-b border-border flex items-center justify-between px-2 md:px-4">
          {/* Mobile hamburger menu */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground mr-2"
              aria-label="Open menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}

          <ServerSelector />

          {/* Could add more header items here like settings, user info, etc. */}
          <div className="flex items-center gap-2">
            {/* Placeholder for future header items */}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden">
          {selectedSessionId ? (
            <ChatInterface sessionId={selectedSessionId} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Welcome to My Claudia</h2>
                <p>Select a project and session to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Permission Modal */}
      <PermissionModal
        request={pendingRequest}
        onDecision={handlePermissionDecision}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <ConnectionProvider>
        <AppContent />
      </ConnectionProvider>
    </ThemeProvider>
  );
}

export default App;
