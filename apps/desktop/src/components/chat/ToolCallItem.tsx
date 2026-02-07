import { useState } from 'react';
import type { ToolCallState } from '../../stores/chatStore';
import { getToolIcon } from '../../config/icons';

interface ToolCallItemProps {
  toolCall: ToolCallState;
}

// Format tool input for display
function formatToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') {
    return JSON.stringify(input, null, 2);
  }

  const obj = input as Record<string, unknown>;

  switch (toolName) {
    case 'Read':
      return obj.file_path as string || JSON.stringify(input);
    case 'Write':
      return obj.file_path as string || JSON.stringify(input);
    case 'Edit':
      return obj.file_path as string || JSON.stringify(input);
    case 'Bash':
      return obj.command as string || JSON.stringify(input);
    case 'Grep':
      return `${obj.pattern || ''} ${obj.path ? `in ${obj.path}` : ''}`;
    case 'Glob':
      return `${obj.pattern || ''} ${obj.path ? `in ${obj.path}` : ''}`;
    case 'Task':
      return obj.description as string || JSON.stringify(input);
    case 'WebFetch':
      return obj.url as string || JSON.stringify(input);
    case 'WebSearch':
      return obj.query as string || JSON.stringify(input);
    default:
      return JSON.stringify(input, null, 2);
  }
}

// Format tool result for display
function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    // Trim leading/trailing whitespace from command output
    const trimmed = result.trim();
    // Truncate long strings
    if (trimmed.length > 500) {
      return trimmed.substring(0, 500) + '... (truncated)';
    }
    return trimmed;
  }
  const json = JSON.stringify(result, null, 2);
  if (json.length > 500) {
    return json.substring(0, 500) + '... (truncated)';
  }
  return json;
}

export function ToolCallItem({ toolCall }: ToolCallItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toolName, toolInput, status, result, isError } = toolCall;

  const icon = getToolIcon(toolName);
  const summary = formatToolInput(toolName, toolInput);

  return (
    <div
      data-testid="tool-use"
      className={`my-2 rounded-lg border ${
        status === 'running'
          ? 'border-primary/30 bg-primary/5'
          : isError
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-success/30 bg-success/5'
      }`}
    >
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 rounded-lg transition-colors"
      >
        {/* Status indicator */}
        {status === 'running' ? (
          <span className="animate-spin text-primary">⟳</span>
        ) : isError ? (
          <span className="text-destructive">✗</span>
        ) : (
          <span className="text-success">✓</span>
        )}

        {/* Tool icon and name */}
        <span className="text-sm">{icon}</span>
        <span className="text-sm font-medium text-foreground" data-testid="tool-name">{toolName}</span>

        {/* Summary */}
        <span className="flex-1 text-sm text-muted-foreground truncate ml-2">
          {summary}
        </span>

        {/* Expand/collapse indicator */}
        <span className="text-muted-foreground text-xs">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50">
          {/* Input */}
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">Input:</div>
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto text-foreground">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </div>

          {/* Result (if completed) */}
          {status !== 'running' && result !== undefined && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">
                {isError ? 'Error:' : 'Result:'}
              </div>
              <pre
                data-testid="tool-result"
                className={`text-xs rounded p-2 overflow-x-auto ${
                  isError
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted/50 text-foreground'
                }`}
              >
                {formatToolResult(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolCallListProps {
  toolCalls: ToolCallState[];
  defaultCollapsed?: boolean;
}

// Get a short summary of what a tool call did
function getToolCallSummary(tc: ToolCallState): string {
  const input = tc.toolInput as Record<string, unknown> | undefined;
  if (!input) return tc.toolName;

  switch (tc.toolName) {
    case 'Read':
      return input.file_path ? `📖 ${String(input.file_path).split('/').pop()}` : '📖 Read';
    case 'Write':
      return input.file_path ? `✏️ ${String(input.file_path).split('/').pop()}` : '✏️ Write';
    case 'Edit':
      return input.file_path ? `📝 ${String(input.file_path).split('/').pop()}` : '📝 Edit';
    case 'Bash':
      const cmd = String(input.command || '').split(' ')[0];
      return `💻 ${cmd || 'bash'}`;
    case 'Grep':
      return `🔍 grep ${String(input.pattern || '').substring(0, 15)}`;
    case 'Glob':
      return `📁 glob ${String(input.pattern || '').substring(0, 15)}`;
    case 'Task':
      return `🤖 ${String(input.description || 'task').substring(0, 20)}`;
    case 'WebFetch':
      try {
        const url = new URL(String(input.url || ''));
        return `🌐 ${url.hostname}`;
      } catch {
        return '🌐 fetch';
      }
    case 'WebSearch':
      return `🔎 ${String(input.query || '').substring(0, 15)}`;
    case 'TodoWrite':
      return '📋 Update todos';
    default:
      return `🔧 ${tc.toolName}`;
  }
}

// Get status icon
function getStatusIcon(status: ToolCallState['status']): string {
  switch (status) {
    case 'completed': return '✓';
    case 'error': return '✗';
    case 'running': return '⟳';
    default: return '';
  }
}

export function ToolCallList({ toolCalls, defaultCollapsed = false }: ToolCallListProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (toolCalls.length === 0) return null;

  // When collapsed, show a detailed summary of each tool call
  if (isCollapsed) {
    const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
    const errorCount = toolCalls.filter(tc => tc.status === 'error').length;
    const runningCount = toolCalls.filter(tc => tc.status === 'running').length;

    return (
      <div
        onClick={() => setIsCollapsed(false)}
        className="px-3 py-2 text-xs bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
      >
        {/* Header with counts */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-foreground font-medium">
            🔧 {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
          </span>
          <span className="text-muted-foreground">
            {completedCount > 0 && <span className="text-success">✓{completedCount}</span>}
            {errorCount > 0 && <span className="text-destructive ml-1">✗{errorCount}</span>}
            {runningCount > 0 && <span className="text-primary ml-1">⟳{runningCount}</span>}
          </span>
          <span className="text-muted-foreground ml-auto text-[10px]">Click to expand ▶</span>
        </div>
        {/* Brief list of each tool call */}
        <div className="flex flex-wrap gap-1.5">
          {toolCalls.map((tc, idx) => (
            <span
              key={tc.id || idx}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                tc.status === 'error'
                  ? 'bg-destructive/20 text-destructive'
                  : tc.status === 'running'
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground'
              }`}
              title={formatToolInput(tc.toolName, tc.toolInput)}
            >
              <span>{getStatusIcon(tc.status)}</span>
              <span className="truncate max-w-[120px]">{getToolCallSummary(tc)}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Collapse button */}
      {defaultCollapsed && (
        <button
          onClick={() => setIsCollapsed(true)}
          className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>▼</span>
          <span>Collapse tool calls</span>
        </button>
      )}
      {toolCalls.map((tc) => (
        <ToolCallItem key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}
