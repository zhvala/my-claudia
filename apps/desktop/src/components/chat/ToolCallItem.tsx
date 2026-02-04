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
    // Truncate long strings
    if (result.length > 500) {
      return result.substring(0, 500) + '... (truncated)';
    }
    return result;
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
          ? 'border-blue-500/30 bg-blue-500/5'
          : isError
          ? 'border-red-500/30 bg-red-500/5'
          : 'border-green-500/30 bg-green-500/5'
      }`}
    >
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 rounded-lg transition-colors"
      >
        {/* Status indicator */}
        {status === 'running' ? (
          <span className="animate-spin text-blue-400">⟳</span>
        ) : isError ? (
          <span className="text-red-400">✗</span>
        ) : (
          <span className="text-green-400">✓</span>
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

export function ToolCallList({ toolCalls, defaultCollapsed = false }: ToolCallListProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  if (toolCalls.length === 0) return null;

  // When collapsed, show a summary
  if (isCollapsed) {
    const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
    const errorCount = toolCalls.filter(tc => tc.status === 'error').length;
    const runningCount = toolCalls.filter(tc => tc.status === 'running').length;

    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="flex items-center gap-2 px-3 py-2 text-xs bg-muted/50 rounded-lg hover:bg-muted transition-colors w-full text-left"
      >
        <span className="text-muted-foreground">🔧</span>
        <span className="text-foreground font-medium">
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
        </span>
        <span className="text-muted-foreground">
          {completedCount > 0 && <span className="text-success">✓{completedCount}</span>}
          {errorCount > 0 && <span className="text-destructive ml-1">✗{errorCount}</span>}
          {runningCount > 0 && <span className="text-primary ml-1">⟳{runningCount}</span>}
        </span>
        <span className="text-muted-foreground ml-auto">▶</span>
      </button>
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
