import { useState, useEffect } from 'react';
import type { Project, ProviderConfig } from '@my-claudia/shared';
import { useServerStore } from '../stores/serverStore';
import { useProjectStore } from '../stores/projectStore';
import * as api from '../services/api';

interface ProjectSettingsProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSettings({ project, isOpen, onClose }: ProjectSettingsProps) {
  const { connectionStatus } = useServerStore();
  const { updateProject } = useProjectStore();
  const isConnected = connectionStatus === 'connected';

  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [providerId, setProviderId] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Load providers and populate form when project changes
  useEffect(() => {
    if (isOpen && isConnected) {
      loadProviders();
    }
    if (project) {
      setName(project.name);
      setRootPath(project.rootPath || '');
      setProviderId(project.providerId || '');
      setSystemPrompt(project.systemPrompt || '');
    }
  }, [isOpen, project, isConnected]);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const data = await api.getProviders();
      setProviders(data);
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!project || !name.trim()) return;

    setSaving(true);
    try {
      await api.updateProject(project.id, {
        name: name.trim(),
        rootPath: rootPath.trim() || undefined,
        providerId: providerId || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
      });

      updateProject(project.id, {
        name: name.trim(),
        rootPath: rootPath.trim() || undefined,
        providerId: providerId || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
      });

      onClose();
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !project) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[500px] md:max-h-[80vh] bg-card border border-border rounded-lg shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-card-foreground">Project Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Working Directory
            </label>
            <input
              type="text"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="/path/to/project"
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The directory where Claude will execute commands
            </p>
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Provider
            </label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              disabled={loading}
              className="w-full h-[38px] px-3 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="">Default Provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.type})
                  {provider.isDefault ? ' - Default' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Select which Claude configuration to use for this project
            </p>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              System Prompt
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={4}
              className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Custom instructions to prepend to every conversation
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
