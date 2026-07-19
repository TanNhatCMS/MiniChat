import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Socket.IO Client - Property-Based Tests
 *
 * Property-based tests for the client socket module using fast-check.
 */
describe('Socket.IO Client - Property-Based Tests', () => {
  /**
   * Property 22: Client singleton socket pattern
   *
   * *For any* number of calls to `connectSocket()`, all invocations SHALL return
   * the same Socket instance when the socket is already connected.
   *
   * **Validates: Requirements 2.1**
   */
  describe('Property 22: Client singleton socket pattern', () => {
    const mockSocket: any = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    let socketModule: typeof import('../lib/socket');

    beforeEach(async () => {
      vi.resetModules();
      mockSocket.connected = true;
      mockSocket.on.mockReset();
      mockSocket.off.mockReset();
      mockSocket.emit.mockReset();
      mockSocket.disconnect.mockReset();

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      socketModule = await import('../lib/socket');
    });

    it('for any number of connectSocket() calls, all return the same instance', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 20 }),
          (numCalls) => {
            const firstSocket = socketModule.connectSocket();
            for (let i = 1; i < numCalls; i++) {
              const nextSocket = socketModule.connectSocket();
              expect(nextSocket).toBe(firstSocket);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 23: Client reconnect re-registers automatically
   *
   * *For any* stored username, when the socket fires a `connect` event
   * (indicating reconnection), the client SHALL emit a `register` event
   * with the stored username.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 23: Client reconnect re-registers automatically', () => {
    const mockSocket: any = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(() => {
        mockSocket.connected = false;
      }),
    };

    let socketModule: typeof import('../lib/socket');

    beforeEach(async () => {
      vi.resetModules();
      mockSocket.connected = false;
      mockSocket.on.mockReset();
      mockSocket.off.mockReset();
      mockSocket.emit.mockReset();
      mockSocket.disconnect.mockReset();

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      socketModule = await import('../lib/socket');
    });

    it('for any stored username, connect handler emits register with that username', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (username) => {
            // Reset mocks for each property iteration
            mockSocket.on.mockReset();
            mockSocket.emit.mockReset();
            mockSocket.connected = false;

            // Set username and connect
            socketModule.setUsername(username);
            socketModule.connectSocket();

            // Find the 'connect' handler registered via mockSocket.on
            const connectHandler = mockSocket.on.mock.calls.find(
              (call: any) => call[0] === 'connect',
            )?.[1];

            expect(connectHandler).toBeDefined();

            // Invoke the connect handler (simulating reconnection)
            connectHandler();

            // Verify register was emitted with the stored username
            expect(mockSocket.emit).toHaveBeenCalledWith('register', { username });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('when no username is stored, connect handler does NOT emit register', () => {
      // Reset mocks
      mockSocket.on.mockReset();
      mockSocket.emit.mockReset();
      mockSocket.connected = false;

      // Do NOT set any username — connect without storing one
      socketModule.connectSocket();

      // Find the 'connect' handler
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any) => call[0] === 'connect',
      )?.[1];

      expect(connectHandler).toBeDefined();

      // Invoke connect handler
      connectHandler();

      // Verify register was NOT emitted
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  /**
   * Property 24: Client emit reflects connection state
   *
   * *For any* event and payload, `emit()` SHALL return `true` and call
   * `socket.emit` when the socket is connected, and SHALL return `false`
   * without throwing when the socket is not connected.
   *
   * **Validates: Requirements 13.1, 13.2**
   */
  describe('Property 24: Client emit reflects connection state', () => {
    const mockSocket: any = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    let socketModule: typeof import('../lib/socket');

    beforeEach(async () => {
      vi.resetModules();
      mockSocket.connected = true;
      mockSocket.on.mockReset();
      mockSocket.off.mockReset();
      mockSocket.emit.mockReset();
      mockSocket.disconnect.mockReset();

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      socketModule = await import('../lib/socket');
    });

    it('for any event and payload, emit returns true and calls socket.emit when connected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue()),
          (event, payload) => {
            mockSocket.emit.mockReset();
            mockSocket.connected = true;

            // Ensure socket is initialized
            socketModule.connectSocket();

            const result = socketModule.emit(event, payload as Record<string, unknown>);

            expect(result).toBe(true);
            expect(mockSocket.emit).toHaveBeenCalledWith(event, payload);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('for any event and payload, emit returns false without throwing when disconnected', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue()),
          (event, payload) => {
            mockSocket.emit.mockReset();
            mockSocket.connected = false;

            // Initialize socket in disconnected state
            socketModule.connectSocket();
            mockSocket.connected = false;

            // Should not throw
            const result = socketModule.emit(event, payload as Record<string, unknown>);

            expect(result).toBe(false);
            // socket.emit should NOT have been called with our specific event
            const emitCalls = mockSocket.emit.mock.calls.filter(
              (call: any[]) => call[0] === event,
            );
            expect(emitCalls).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 25: Client on returns working unsubscribe
   *
   * *For any* event name and handler, verify `on()` subscribes the handler
   * and returns a function that removes it from listeners.
   *
   * **Validates: Requirements 13.3**
   */
  describe('Property 25: Client on returns working unsubscribe', () => {
    const mockSocket: any = {
      connected: false,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    let socketModule: typeof import('../lib/socket');

    beforeEach(async () => {
      vi.resetModules();
      mockSocket.connected = false;
      mockSocket.on.mockReset();
      mockSocket.off.mockReset();
      mockSocket.emit.mockReset();
      mockSocket.disconnect.mockReset();

      vi.doMock('socket.io-client', () => ({
        io: vi.fn(() => mockSocket),
      }));

      socketModule = await import('../lib/socket');
    });

    it('for any event name, on() subscribes the handler and the returned function unsubscribes it', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (eventName) => {
            // Reset mocks per iteration
            mockSocket.on.mockReset();
            mockSocket.off.mockReset();
            mockSocket.connected = false;

            // Connect first so socket is available
            socketModule.connectSocket();

            // Create a handler function
            const handler = vi.fn();

            // Call on() with the event and handler
            const unsubscribe = socketModule.on(eventName, handler);

            // Verify mockSocket.on was called with the event and handler
            expect(mockSocket.on).toHaveBeenCalledWith(eventName, handler);

            // Call the returned unsubscribe function
            unsubscribe();

            // Verify mockSocket.off was called with the event and the same handler
            expect(mockSocket.off).toHaveBeenCalledWith(eventName, handler);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
