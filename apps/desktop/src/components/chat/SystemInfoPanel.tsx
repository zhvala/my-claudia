import { useState } from 'react';
import type { SystemInfo } from '@my-claudia/shared';

interface SystemInfoPanelProps {
  systemInfo: SystemInfo;
}

export function SystemInfoPanel({ systemInfo }: SystemInfoPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasAnyInfo =
    systemInfo.model ||
    systemInfo.claudeCodeVersion ||
    systemInfo.cwd ||
    systemInfo.permissionMode ||
    systemInfo.apiKeySource ||
    (systemInfo.tools && systemInfo.tools.length > 0) ||
    (systemInfo.mcpServers && systemInfo.mcpServers.length > 0) ||
    (systemInfo.slashCommands && systemInfo.slashCommands.length > 0) ||
    (systemInfo.agents && systemInfo.agents.length > 0);

  if (!hasAnyInfo) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-lg mx-4 mb-4 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
      >
        <span className="text-blue-600 dark:text-blue-400 text-sm">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          System Info
        </span>
        {systemInfo.model && (
          <span className="text-xs text-blue-600/70 dark:text-blue-400/70 ml-auto">
            {systemInfo.model}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Primary info row */}
          <div className="flex flex-wrap gap-3 text-xs">
            {systemInfo.model && (
              <InfoBadge icon="🤖" label="Model" value={systemInfo.model} />
            )}
            {systemInfo.claudeCodeVersion && (
              <InfoBadge icon="📦" label="Version" value={systemInfo.claudeCodeVersion} />
            )}
            {systemInfo.permissionMode && (
              <InfoBadge icon="🛡️" label="Permission" value={systemInfo.permissionMode} />
            )}
            {systemInfo.apiKeySource && (
              <InfoBadge icon="🔑" label="API Key" value={systemInfo.apiKeySource} />
            )}
          </div>

          {/* Working directory */}
          {systemInfo.cwd && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>📁</span>
              <span className="font-mono truncate" title={systemInfo.cwd}>
                {systemInfo.cwd}
              </span>
            </div>
          )}

          {/* Tools */}
          {systemInfo.tools && systemInfo.tools.length > 0 && (
            <CollapsibleList
              icon="🔧"
              label="Tools"
              items={systemInfo.tools}
              maxVisible={5}
            />
          )}

          {/* MCP Servers */}
          {systemInfo.mcpServers && systemInfo.mcpServers.length > 0 && (
            <CollapsibleList
              icon="🖥️"
              label="MCP Servers"
              items={systemInfo.mcpServers}
              maxVisible={3}
            />
          )}

          {/* Agents */}
          {systemInfo.agents && systemInfo.agents.length > 0 && (
            <CollapsibleList
              icon="👥"
              label="Agents"
              items={systemInfo.agents}
              maxVisible={3}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface InfoBadgeProps {
  icon: string;
  label: string;
  value: string;
}

function InfoBadge({ icon, label, value }: InfoBadgeProps) {
  return (
    <div className="flex items-center gap-1.5 bg-white/60 dark:bg-gray-800/60 px-2 py-1 rounded-md">
      <span>{icon}</span>
      <span className="text-gray-500 dark:text-gray-400">{label}:</span>
      <span className="font-medium text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  );
}

interface CollapsibleListProps {
  icon: string;
  label: string;
  items: string[];
  maxVisible: number;
}

function CollapsibleList({ icon, label, items, maxVisible }: CollapsibleListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, maxVisible);
  const hasMore = items.length > maxVisible;

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
        <span>{icon}</span>
        <span>{label}</span>
        <span className="text-gray-400 dark:text-gray-500">({items.length})</span>
      </div>
      <div className="flex flex-wrap gap-1 ml-5">
        {displayItems.map((item, index) => (
          <span
            key={index}
            className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px] font-mono"
          >
            {item}
          </span>
        ))}
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-blue-600 dark:text-blue-400 hover:underline text-[10px]"
          >
            {showAll ? 'show less' : `+${items.length - maxVisible} more`}
          </button>
        )}
      </div>
    </div>
  );
}
