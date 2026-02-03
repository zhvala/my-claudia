import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

interface MockWebSocketInstance {
  url: string;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  simulateOpen: () => void;
}

// Store for mocking stores
const mockChatStore = {
  addMessage: vi.fn(),
  appendToLastMessage: vi.fn(),
  setLoading: vi.fn(),
  setCurrentRunId: vi.fn(),
  addToolCall: vi.fn(),
  updateToolCallResult: vi.fn(),
  clearToolCalls: vi.fn(),
};

const mockProjectStore = {
  selectedSessionId: 'session-1',
};

const mockServerStore = {
  activeServerId: 'server-1',
  connectionStatus: 'connected' as 'connecting' | 'connected' | 'disconnected' | 'error',
  getActiveServer: vi.fn(),
  setConnectionStatus: vi.fn(),
  updateLastConnected: vi.fn(),
};

const mockPermissionStore = {
  setPendingRequest: vi.fn(),
};

// Mock the stores
vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => mockChatStore,
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore,
}));

vi.mock('../../stores/serverStore', () => ({
  useServerStore: Object.assign(
    () => mockServerStore,
    {
      getState: () => mockServerStore,
    }
  ),
}));

vi.mock('../../stores/permissionStore', () => ({
  usePermissionStore: () => mockPermissionStore,
}));

describe('useWebSocket', () => {
  let wsInstances: MockWebSocketInstance[] = [];
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    wsInstances = [];

    // Save original
    originalWebSocket = globalThis.WebSocket;

    // Create mock WebSocket class
    const MockWS = class MockWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;

      url: string;
      readyState = 1; // Start as OPEN to avoid reconnection logic

      onopen: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      send = vi.fn();
      close = vi.fn();

      constructor(url: string) {
        this.url = url;
        wsInstances.push(this as unknown as MockWebSocketInstance);
        // Immediately simulate open
        Promise.resolve().then(() => {
          if (this.onopen) {
            this.onopen(new Event('open'));
          }
        });
      }

      simulateOpen() {
        this.readyState = 1;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    };

    globalThis.WebSocket = MockWS as unknown as typeof WebSocket;

    // Reset store states
    mockServerStore.connectionStatus = 'connected';
    mockServerStore.activeServerId = 'server-1';
    mockProjectStore.selectedSessionId = 'session-1';
    mockServerStore.getActiveServer.mockReturnValue({
      id: 'server-1',
      name: 'Test Server',
      address: 'localhost:3100',
      requiresAuth: false,
      isDefault: true,
      createdAt: Date.now(),
    });
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const getLatestWsInstance = () => wsInstances[wsInstances.length - 1];

  describe('connection URL generation', () => {
    it('connects to WebSocket with correct URL', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(wsInstances.length).toBeGreaterThan(0);
      expect(getLatestWsInstance().url).toBe('ws://localhost:3100/ws');
    });

    it('generates correct WebSocket URL from server address', async () => {
      mockServerStore.getActiveServer.mockReturnValue({
        id: 'server-1',
        name: 'Test',
        address: 'example.com:8080',
        requiresAuth: true,
        isDefault: false,
        createdAt: Date.now(),
      });

      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(getLatestWsInstance().url).toBe('ws://example.com:8080/ws');
    });

    it('handles protocol conversion (http to ws)', async () => {
      mockServerStore.getActiveServer.mockReturnValue({
        id: 'server-1',
        name: 'Test',
        address: 'http://example.com:8080',
        requiresAuth: true,
        isDefault: false,
        createdAt: Date.now(),
      });

      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(getLatestWsInstance().url).toBe('ws://example.com:8080/ws');
    });

    it('sets error status when no server configured', async () => {
      mockServerStore.getActiveServer.mockReturnValue(null);

      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(wsInstances.length).toBe(0);
      expect(mockServerStore.setConnectionStatus).toHaveBeenCalledWith('error', 'No server configured');
    });
  });

  describe('message handling', () => {
    it('handles run_started message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();
      expect(ws).toBeDefined();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({ type: 'run_started', runId: 'run-1' }),
        }));
      });

      expect(mockChatStore.setLoading).toHaveBeenCalledWith(true);
      expect(mockChatStore.setCurrentRunId).toHaveBeenCalledWith('run-1');
      expect(mockChatStore.clearToolCalls).toHaveBeenCalled();
    });

    it('handles delta message and appends to last message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({ type: 'delta', content: 'Hello' }),
        }));
      });

      expect(mockChatStore.appendToLastMessage).toHaveBeenCalledWith('session-1', 'Hello');
    });

    it('handles tool_use message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'tool_use',
            toolUseId: 'tool-1',
            toolName: 'Read',
            toolInput: { path: '/file.ts' },
          }),
        }));
      });

      expect(mockChatStore.addToolCall).toHaveBeenCalledWith(
        'tool-1',
        'Read',
        { path: '/file.ts' }
      );
    });

    it('handles tool_result message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'tool_result',
            toolUseId: 'tool-1',
            result: 'File content',
            isError: false,
          }),
        }));
      });

      expect(mockChatStore.updateToolCallResult).toHaveBeenCalledWith(
        'tool-1',
        'File content',
        false
      );
    });

    it('handles run_completed message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({ type: 'run_completed' }),
        }));
      });

      expect(mockChatStore.setLoading).toHaveBeenCalledWith(false);
      expect(mockChatStore.setCurrentRunId).toHaveBeenCalledWith(null);
    });

    it('handles permission_request message', async () => {
      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'permission_request',
            requestId: 'req-1',
            toolName: 'Bash',
            detail: '{"command": "ls"}',
            timeoutSeconds: 60,
          }),
        }));
      });

      expect(mockPermissionStore.setPendingRequest).toHaveBeenCalledWith({
        requestId: 'req-1',
        toolName: 'Bash',
        detail: '{"command": "ls"}',
        timeoutSec: 60,
      });
    });

    it('handles error message', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        ws.onmessage!(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'error',
            code: 'SERVER_ERROR',
            message: 'Something went wrong',
          }),
        }));
      });

      expect(consoleSpy).toHaveBeenCalledWith('Server error:', 'SERVER_ERROR', 'Something went wrong');

      consoleSpy.mockRestore();
    });
  });

  describe('sendMessage', () => {
    it('sends message when connected', async () => {
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        result.current.sendMessage({ type: 'ping' });
      });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    });

    it('warns when not connected', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockServerStore.getActiveServer.mockReturnValue(null);

      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      act(() => {
        result.current.sendMessage({ type: 'ping' });
      });

      expect(consoleSpy).toHaveBeenCalledWith('WebSocket is not connected');

      consoleSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    it('closes WebSocket when disconnect is called', async () => {
      const { result } = renderHook(() => useWebSocket());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });

      const ws = getLatestWsInstance();

      act(() => {
        result.current.disconnect();
      });

      expect(ws.close).toHaveBeenCalled();
    });
  });
});
