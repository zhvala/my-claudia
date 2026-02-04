import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useServerStore } from '../stores/serverStore';
import { ProjectSettings } from './ProjectSettings';
import { SettingsPanel } from './SettingsPanel';
import * as api from '../services/api';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, isMobile, isOpen, onClose }: SidebarProps) {
  const {
    projects = [],
    sessions = [],
    selectedProjectId,
    selectedSessionId,
    selectProject,
    selectSession,
    addProject,
    addSession,
    deleteProject,
    deleteSession,
  } = useProjectStore();

  const { connectionStatus, isLocalConnection } = useServerStore();

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectRootPath, setNewProjectRootPath] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingSessionForProject, setCreatingSessionForProject] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
  const [contextMenuSession, setContextMenuSession] = useState<string | null>(null);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const settingsProject = settingsProjectId ? projects?.find(p => p.id === settingsProjectId) || null : null;

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
    selectProject(projectId);
  };

  const isConnected = connectionStatus === 'connected';

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !isConnected || isLocalConnection === false) return;

    setCreatingProject(true);
    try {
      const project = await api.createProject({
        name: newProjectName.trim(),
        type: 'code',
        rootPath: newProjectRootPath.trim() || undefined
      });
      addProject(project);
      setNewProjectName('');
      setNewProjectRootPath('');
      setShowNewProjectForm(false);
      // Auto-expand and select the new project
      setExpandedProjects((prev) => new Set(prev).add(project.id));
      selectProject(project.id);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateSession = async (projectId: string) => {
    if (!isConnected || isLocalConnection === false) return;

    try {
      const session = await api.createSession({
        projectId,
        name: newSessionName.trim() || undefined
      });
      addSession(session);
      setNewSessionName('');
      setCreatingSessionForProject(null);
      selectSession(session.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!isConnected || isLocalConnection === false) return;

    try {
      await api.deleteProject(projectId);
      deleteProject(projectId);
      setContextMenuProject(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!isConnected || isLocalConnection === false) return;

    try {
      await api.deleteSession(sessionId);
      deleteSession(sessionId);
      setContextMenuSession(null);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Mobile: render as overlay drawer
  if (isMobile) {
    if (!isOpen) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
        {/* Drawer */}
        <div className="fixed inset-y-0 left-0 w-64 bg-card z-50 shadow-xl flex flex-col">
          {/* Header with close button */}
          <div className="h-12 border-b border-border flex items-center justify-between px-4">
            <h1 className="font-semibold text-lg">My Claudia</h1>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
              title="Close menu"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="flex items-center justify-between mb-2 px-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Projects
              </span>
              {isLocalConnection !== false && (
                <button
                  onClick={() => setShowNewProjectForm(true)}
                  disabled={!isConnected}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!isConnected ? "Connect to server first" : "Add Project"}
                >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              )}
            </div>

            {/* New Project Form */}
            {showNewProjectForm && (
              <div className="mb-2 px-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowNewProjectForm(false);
                      setNewProjectName('');
                      setNewProjectRootPath('');
                    }
                  }}
                  placeholder="Project name"
                  className="w-full px-2 py-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
                <input
                  type="text"
                  value={newProjectRootPath}
                  onChange={(e) => setNewProjectRootPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject();
                    if (e.key === 'Escape') {
                      setShowNewProjectForm(false);
                      setNewProjectName('');
                      setNewProjectRootPath('');
                    }
                  }}
                  placeholder="Working directory (e.g. /path/to/project)"
                  className="w-full px-2 py-1 mt-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim() || creatingProject}
                    className="flex-1 px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs disabled:opacity-50"
                  >
                    {creatingProject ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewProjectForm(false);
                      setNewProjectName('');
                      setNewProjectRootPath('');
                    }}
                    className="flex-1 px-2 py-1 bg-secondary hover:bg-secondary/80 rounded text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2">No projects yet</p>
            ) : (
              <ul className="space-y-1">
                {projects.map((project) => (
                  <li key={project.id} className="relative">
                    <div className="flex items-center group">
                      <button
                        onClick={() => toggleProject(project.id)}
                        className={`flex-1 text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${
                          selectedProjectId === project.id
                            ? 'bg-secondary text-foreground'
                            : 'text-muted-foreground hover:bg-secondary'
                        }`}
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            expandedProjects.has(project.id) ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span className="truncate">{project.name}</span>
                      </button>
                      {/* Project menu button - only show for local connections */}
                      {isLocalConnection !== false && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuProject(contextMenuProject === project.id ? null : project.id);
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary"
                        >
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Project context menu - only show for local connections */}
                    {isLocalConnection !== false && contextMenuProject === project.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setContextMenuProject(null)} />
                        <div className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded shadow-lg z-50">
                          <button
                            onClick={() => {
                              setSettingsProjectId(project.id);
                              setContextMenuProject(null);
                            }}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Settings
                          </button>
                          <button
                            onClick={() => handleDeleteProject(project.id)}
                            className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-secondary flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </>
                    )}

                    {/* Sessions */}
                    {expandedProjects.has(project.id) && (
                      <ul className="ml-4 mt-1 space-y-1" data-testid="session-list">
                        {sessions
                          .filter((s) => s.projectId === project.id)
                          .map((session) => (
                            <li key={session.id} className="relative group" data-testid="session-item">
                              <div className="flex items-center">
                                <button
                                  onClick={() => {
                                    selectSession(session.id);
                                    // Auto-close sidebar on mobile
                                    if (onClose) onClose();
                                  }}
                                  className={`flex-1 text-left px-2 py-1 rounded text-sm truncate ${
                                    selectedSessionId === session.id
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                  }`}
                                >
                                  {session.name || 'Untitled Session'}
                                </button>
                                {/* Session menu button - only show for local connections */}
                                {isLocalConnection !== false && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setContextMenuSession(contextMenuSession === session.id ? null : session.id);
                                    }}
                                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary"
                                  >
                                    <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                    </svg>
                                  </button>
                                )}
                              </div>

                              {/* Session context menu - only show for local connections */}
                              {isLocalConnection !== false && contextMenuSession === session.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setContextMenuSession(null)} />
                                  <div className="absolute right-0 top-full mt-1 w-32 bg-popover border border-border rounded shadow-lg z-50">
                                    <button
                                      onClick={() => handleDeleteSession(session.id)}
                                      className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-secondary"
                                    >
                                      Delete Session
                                    </button>
                                  </div>
                                </>
                              )}
                            </li>
                          ))}

                        {/* New session form or button */}
                        {creatingSessionForProject === project.id ? (
                          <li>
                            <input
                              type="text"
                              value={newSessionName}
                              onChange={(e) => setNewSessionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateSession(project.id);
                                if (e.key === 'Escape') {
                                  setCreatingSessionForProject(null);
                                  setNewSessionName('');
                                }
                              }}
                              placeholder="Session name (optional)"
                              className="w-full px-2 py-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
                              autoFocus
                            />
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={() => handleCreateSession(project.id)}
                                className="flex-1 px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs"
                              >
                                Create
                              </button>
                              <button
                                onClick={() => {
                                  setCreatingSessionForProject(null);
                                  setNewSessionName('');
                                }}
                                className="flex-1 px-2 py-0.5 bg-secondary hover:bg-secondary/80 rounded text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </li>
                        ) : isLocalConnection !== false ? (
                          <li>
                            <button
                              onClick={() => setCreatingSessionForProject(project.id)}
                              disabled={!isConnected}
                              data-testid="new-session-btn"
                              className="w-full text-left px-2 py-1 rounded text-sm text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={!isConnected ? "Connect to server first" : "New Session"}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              New Session
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Settings Button */}
          <div className="border-t border-border p-2">
            <button
              onClick={() => setShowSettings(true)}
              data-testid="settings-button"
              className="w-full text-left px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Settings
            </button>
          </div>

          {/* Project Settings Modal */}
          <ProjectSettings
            project={settingsProject}
            isOpen={!!settingsProjectId}
            onClose={() => setSettingsProjectId(null)}
          />

          {/* Settings Panel */}
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
          />
        </div>
      </>
    );
  }

  // Desktop: collapsed state
  if (collapsed) {
    return (
      <div className="w-12 bg-card border-r border-border flex flex-col items-center py-4">
        <button
          onClick={onToggle}
          className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Expand sidebar"
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
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  // Desktop: expanded state
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-4">
        <h1 className="font-semibold text-lg">My Claudia</h1>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Collapse sidebar"
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
              d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between mb-2 px-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            Projects
          </span>
          {isLocalConnection !== false && (
            <button
              onClick={() => setShowNewProjectForm(true)}
              disabled={!isConnected}
              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isConnected ? "Connect to server first" : "Add Project"}
            >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
          )}
        </div>

        {/* New Project Form */}
        {showNewProjectForm && (
          <div className="mb-2 px-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowNewProjectForm(false);
                  setNewProjectName('');
                  setNewProjectRootPath('');
                }
              }}
              placeholder="Project name"
              className="w-full px-2 py-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
              autoFocus
            />
            <input
              type="text"
              value={newProjectRootPath}
              onChange={(e) => setNewProjectRootPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') {
                  setShowNewProjectForm(false);
                  setNewProjectName('');
                  setNewProjectRootPath('');
                }
              }}
              placeholder="Working directory (e.g. /path/to/project)"
              className="w-full px-2 py-1 mt-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-1 mt-1">
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || creatingProject}
                className="flex-1 px-2 py-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs disabled:opacity-50"
              >
                {creatingProject ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowNewProjectForm(false);
                  setNewProjectName('');
                  setNewProjectRootPath('');
                }}
                className="flex-1 px-2 py-1 bg-secondary hover:bg-secondary/80 rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">No projects yet</p>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => (
              <li key={project.id} className="relative">
                <div className="flex items-center group">
                  <button
                    onClick={() => toggleProject(project.id)}
                    className={`flex-1 text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 ${
                      selectedProjectId === project.id
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${
                        expandedProjects.has(project.id) ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="truncate">{project.name}</span>
                  </button>
                  {/* Project menu button - only show for local connections */}
                  {isLocalConnection !== false && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenuProject(contextMenuProject === project.id ? null : project.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary"
                    >
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Project context menu - only show for local connections */}
                {isLocalConnection !== false && contextMenuProject === project.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setContextMenuProject(null)} />
                    <div className="absolute right-0 top-full mt-1 w-36 bg-popover border border-border rounded shadow-lg z-50">
                      <button
                        onClick={() => {
                          setSettingsProjectId(project.id);
                          setContextMenuProject(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-secondary flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </>
                )}

                {/* Sessions */}
                {expandedProjects.has(project.id) && (
                  <ul className="ml-4 mt-1 space-y-1" data-testid="session-list">
                    {sessions
                      .filter((s) => s.projectId === project.id)
                      .map((session) => (
                        <li key={session.id} className="relative group" data-testid="session-item">
                          <div className="flex items-center">
                            <button
                              onClick={() => {
                                selectSession(session.id);
                                // Auto-close sidebar on mobile
                                if (isMobile && onClose) onClose();
                              }}
                              className={`flex-1 text-left px-2 py-1 rounded text-sm truncate ${
                                selectedSessionId === session.id
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                              }`}
                            >
                              {session.name || 'Untitled Session'}
                            </button>
                            {/* Session menu button - only show for local connections */}
                            {isLocalConnection !== false && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContextMenuSession(contextMenuSession === session.id ? null : session.id);
                                }}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary"
                              >
                                <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* Session context menu - only show for local connections */}
                          {isLocalConnection !== false && contextMenuSession === session.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setContextMenuSession(null)} />
                              <div className="absolute right-0 top-full mt-1 w-32 bg-popover border border-border rounded shadow-lg z-50">
                                <button
                                  onClick={() => handleDeleteSession(session.id)}
                                  className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-secondary"
                                >
                                  Delete Session
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}

                    {/* New session form or button */}
                    {creatingSessionForProject === project.id ? (
                      <li>
                        <input
                          type="text"
                          value={newSessionName}
                          onChange={(e) => setNewSessionName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateSession(project.id);
                            if (e.key === 'Escape') {
                              setCreatingSessionForProject(null);
                              setNewSessionName('');
                            }
                          }}
                          placeholder="Session name (optional)"
                          className="w-full px-2 py-1 bg-secondary border border-border rounded text-sm focus:outline-none focus:border-primary"
                          autoFocus
                        />
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => handleCreateSession(project.id)}
                            className="flex-1 px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded text-xs"
                          >
                            Create
                          </button>
                          <button
                            onClick={() => {
                              setCreatingSessionForProject(null);
                              setNewSessionName('');
                            }}
                            className="flex-1 px-2 py-0.5 bg-secondary hover:bg-secondary/80 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </li>
                    ) : isLocalConnection !== false ? (
                      <li>
                        <button
                          onClick={() => setCreatingSessionForProject(project.id)}
                          disabled={!isConnected}
                          data-testid="new-session-btn"
                          className="w-full text-left px-2 py-1 rounded text-sm text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!isConnected ? "Connect to server first" : "New Session"}
                        >
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          New Session
                        </button>
                      </li>
                    ) : null}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Settings Button */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => setShowSettings(true)}
          data-testid="settings-button"
          className="w-full text-left px-2 py-1.5 rounded text-sm text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          Settings
        </button>
      </div>

      {/* Project Settings Modal */}
      <ProjectSettings
        project={settingsProject}
        isOpen={!!settingsProjectId}
        onClose={() => setSettingsProjectId(null)}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
