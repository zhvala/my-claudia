import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import type { Message } from '@my-claudia/shared';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useChatStore.setState({
      messages: {},
      pagination: {},
      isLoading: false,
      currentRunId: null,
    });
  });

  const createMessage = (overrides: Partial<Message> = {}): Message => ({
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Test message',
    createdAt: Date.now(),
    ...overrides,
  });

  describe('setMessages', () => {
    it('sets messages for a session', () => {
      const messages = [createMessage()];
      useChatStore.getState().setMessages('session-1', messages);

      expect(useChatStore.getState().messages['session-1']).toEqual(messages);
    });

    it('replaces existing messages', () => {
      const oldMessages = [createMessage({ id: 'old' })];
      const newMessages = [createMessage({ id: 'new' })];

      useChatStore.getState().setMessages('session-1', oldMessages);
      useChatStore.getState().setMessages('session-1', newMessages);

      expect(useChatStore.getState().messages['session-1']).toEqual(newMessages);
    });

    it('does not affect other sessions', () => {
      const messages1 = [createMessage({ id: '1', sessionId: 'session-1' })];
      const messages2 = [createMessage({ id: '2', sessionId: 'session-2' })];

      useChatStore.getState().setMessages('session-1', messages1);
      useChatStore.getState().setMessages('session-2', messages2);

      expect(useChatStore.getState().messages['session-1']).toEqual(messages1);
      expect(useChatStore.getState().messages['session-2']).toEqual(messages2);
    });
  });

  describe('addMessage', () => {
    it('adds a message to an empty session', () => {
      const message = createMessage();
      useChatStore.getState().addMessage('session-1', message);

      expect(useChatStore.getState().messages['session-1']).toEqual([message]);
    });

    it('appends message to existing messages', () => {
      const message1 = createMessage({ id: '1' });
      const message2 = createMessage({ id: '2' });

      useChatStore.getState().addMessage('session-1', message1);
      useChatStore.getState().addMessage('session-1', message2);

      expect(useChatStore.getState().messages['session-1']).toEqual([
        message1,
        message2,
      ]);
    });
  });

  describe('appendToLastMessage', () => {
    it('appends content to the last assistant message', () => {
      const message = createMessage({ role: 'assistant', content: 'Hello' });
      useChatStore.getState().addMessage('session-1', message);
      useChatStore.getState().appendToLastMessage('session-1', ' World');

      expect(useChatStore.getState().messages['session-1'][0].content).toBe(
        'Hello World'
      );
    });

    it('does not append to user message', () => {
      const message = createMessage({ role: 'user', content: 'Hello' });
      useChatStore.getState().addMessage('session-1', message);
      useChatStore.getState().appendToLastMessage('session-1', ' World');

      expect(useChatStore.getState().messages['session-1'][0].content).toBe(
        'Hello'
      );
    });

    it('does nothing for empty session', () => {
      useChatStore.getState().appendToLastMessage('session-1', 'content');
      expect(useChatStore.getState().messages['session-1']).toBeUndefined();
    });

    it('does not modify previous messages', () => {
      const message1 = createMessage({ id: '1', role: 'user', content: 'User' });
      const message2 = createMessage({
        id: '2',
        role: 'assistant',
        content: 'AI',
      });

      useChatStore.getState().addMessage('session-1', message1);
      useChatStore.getState().addMessage('session-1', message2);
      useChatStore.getState().appendToLastMessage('session-1', ' Response');

      expect(useChatStore.getState().messages['session-1'][0].content).toBe(
        'User'
      );
      expect(useChatStore.getState().messages['session-1'][1].content).toBe(
        'AI Response'
      );
    });
  });

  describe('clearMessages', () => {
    it('clears messages for a session', () => {
      const message = createMessage();
      useChatStore.getState().addMessage('session-1', message);
      useChatStore.getState().clearMessages('session-1');

      expect(useChatStore.getState().messages['session-1']).toEqual([]);
    });

    it('does not affect other sessions', () => {
      useChatStore.getState().addMessage('session-1', createMessage());
      useChatStore.getState().addMessage('session-2', createMessage());
      useChatStore.getState().clearMessages('session-1');

      expect(useChatStore.getState().messages['session-1']).toEqual([]);
      expect(useChatStore.getState().messages['session-2']).toHaveLength(1);
    });
  });

  describe('setLoading', () => {
    it('sets loading state to true', () => {
      useChatStore.getState().setLoading(true);
      expect(useChatStore.getState().isLoading).toBe(true);
    });

    it('sets loading state to false', () => {
      useChatStore.getState().setLoading(true);
      useChatStore.getState().setLoading(false);
      expect(useChatStore.getState().isLoading).toBe(false);
    });
  });

  describe('setCurrentRunId', () => {
    it('sets current run ID', () => {
      useChatStore.getState().setCurrentRunId('run-123');
      expect(useChatStore.getState().currentRunId).toBe('run-123');
    });

    it('clears current run ID', () => {
      useChatStore.getState().setCurrentRunId('run-123');
      useChatStore.getState().setCurrentRunId(null);
      expect(useChatStore.getState().currentRunId).toBeNull();
    });
  });

  describe('pagination', () => {
    it('sets pagination with setMessages', () => {
      const messages = [createMessage()];
      const pagination = { total: 100, hasMore: true, oldestTimestamp: 1000, newestTimestamp: 2000 };

      useChatStore.getState().setMessages('session-1', messages, pagination);

      const storedPagination = useChatStore.getState().pagination['session-1'];
      expect(storedPagination?.total).toBe(100);
      expect(storedPagination?.hasMore).toBe(true);
      expect(storedPagination?.isLoadingMore).toBe(false);
    });

    it('prepends messages with prependMessages', () => {
      const existingMessage = createMessage({ id: 'new', createdAt: 2000 });
      const olderMessage = createMessage({ id: 'old', createdAt: 1000 });

      useChatStore.getState().setMessages('session-1', [existingMessage]);
      useChatStore.getState().prependMessages('session-1', [olderMessage], { total: 2, hasMore: false });

      const messages = useChatStore.getState().messages['session-1'];
      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('old');
      expect(messages[1].id).toBe('new');
    });

    it('setLoadingMore updates isLoadingMore', () => {
      useChatStore.getState().setLoadingMore('session-1', true);
      expect(useChatStore.getState().pagination['session-1']?.isLoadingMore).toBe(true);

      useChatStore.getState().setLoadingMore('session-1', false);
      expect(useChatStore.getState().pagination['session-1']?.isLoadingMore).toBe(false);
    });

    it('clearMessages resets pagination', () => {
      useChatStore.getState().setMessages('session-1', [createMessage()], { total: 10, hasMore: true });
      useChatStore.getState().clearMessages('session-1');

      const pagination = useChatStore.getState().pagination['session-1'];
      expect(pagination?.total).toBe(0);
      expect(pagination?.hasMore).toBe(false);
    });

    it('addMessage updates pagination newestTimestamp', () => {
      const timestamp = Date.now();
      const message = createMessage({ createdAt: timestamp });

      useChatStore.getState().setMessages('session-1', [], { total: 0, hasMore: false });
      useChatStore.getState().addMessage('session-1', message);

      const pagination = useChatStore.getState().pagination['session-1'];
      expect(pagination?.total).toBe(1);
      expect(pagination?.newestTimestamp).toBe(timestamp);
    });
  });
});
