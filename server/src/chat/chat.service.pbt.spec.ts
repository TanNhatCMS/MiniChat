import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ChatService } from './chat.service';
import { ChatStore } from '../shared/stores/chat.store';
import { ServerMonitorService } from '../shared/server-monitor.service';

function createMockSocket(id: string) {
  return {
    id,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn().mockReturnThis(),
  } as any;
}

function createMockServer() {
  const toEmit = vi.fn();
  return {
    emit: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: toEmit }),
    __toEmit: toEmit,
  } as any;
}

function createMockServerMonitor() {
  return {
    setServer: vi.fn(),
    emitStatusNow: vi.fn(),
    getStatus: vi.fn(),
    startBroadcasting: vi.fn(),
    stopBroadcasting: vi.fn(),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  } as unknown as ServerMonitorService;
}

// Generator for valid usernames (1-20 chars after trim, non-empty after trim)
const validUsernameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0 && s.trim().length <= 20);

describe('ChatService - Property-Based Tests', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  /**
   * Property 4: Username validation từ chối input không hợp lệ
   * **Validates: Requirements 6.2, 6.4**
   *
   * For ANY string that is empty OR whitespace-only OR (after trim) longer than 20 chars,
   * register always returns {success: false}.
   */
  describe('Property 4: Username validation rejects invalid input', () => {
    it('rejects empty or whitespace-only usernames', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 50 }),
            fc.stringOf(
              fc.oneof(fc.constant(' '), fc.constant('\t'), fc.constant('\n')),
              { minLength: 1, maxLength: 50 },
            ),
          ),
          (invalidUsername) => {
            const client = createMockSocket('test-socket');
            service.register(client, { username: invalidUsername });

            expect(client.emit).toHaveBeenCalledWith(
              'register-response',
              expect.objectContaining({ success: false }),
            );
            // User should NOT be added to store
            expect(store.users.has('test-socket')).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects usernames longer than 20 chars after trim', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 21, maxLength: 100 }).filter(
            (s) => s.trim().length > 20,
          ),
          (longUsername) => {
            const client = createMockSocket('test-socket');
            store.users.clear();
            store.userToSocket.clear();

            service.register(client, { username: longUsername });

            expect(client.emit).toHaveBeenCalledWith(
              'register-response',
              expect.objectContaining({ success: false }),
            );
            // User should NOT be added to store
            expect(store.users.has('test-socket')).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Username uniqueness enforcement
   * **Validates: Requirement 6.3**
   *
   * For ANY valid username, registering the same username from a different socket
   * always returns {success: false, message: "Username already taken"}.
   */
  describe('Property 5: Username uniqueness enforcement', () => {
    it('rejects duplicate username from a different socket', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (username, socketId1, socketId2Suffix) => {
            // Ensure different socket IDs
            const sid1 = `socket-a-${socketId1}`;
            const sid2 = `socket-b-${socketId2Suffix}`;
            if (sid1 === sid2) return; // skip if same ID by chance

            // Fresh store for each run
            store.users.clear();
            store.userToSocket.clear();

            const client1 = createMockSocket(sid1);
            const client2 = createMockSocket(sid2);

            // First registration succeeds
            service.register(client1, { username });

            // Second registration from different socket fails
            service.register(client2, { username: username.trim() });

            expect(client2.emit).toHaveBeenCalledWith('register-response', {
              success: false,
              message: 'Username already taken',
            });

            // Store should still have the original mapping
            expect(store.users.get(sid1)).toBe(username.trim());
            expect(store.userToSocket.get(username.trim())).toBe(sid1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 6: Re-registration behavior trên cùng socket
   * **Validates: Requirements 6.7, 6.8**
   *
   * For ANY registered socket:
   * - Re-registering with same username returns success (idempotent)
   * - Re-registering with different username returns "Cannot change username"
   */
  describe('Property 6: Re-registration behavior on same socket', () => {
    it('idempotent re-register with same username returns success', () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          store.users.clear();
          store.userToSocket.clear();

          const client = createMockSocket('same-socket');
          service.register(client, { username });

          // Clear mocks to check second call
          client.emit.mockClear();
          client.broadcast.emit.mockClear();

          // Re-register with same username
          service.register(client, { username: username.trim() });

          expect(client.emit).toHaveBeenCalledWith(
            'register-response',
            expect.objectContaining({ success: true, username: username.trim() }),
          );
          // Should NOT broadcast user-joined again
          expect(client.broadcast.emit).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it('rejects change to different username on same socket', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          validUsernameArb,
          (username1, username2) => {
            const trimmed1 = username1.trim();
            const trimmed2 = username2.trim();
            // Only test when usernames are actually different
            if (trimmed1 === trimmed2) return;

            store.users.clear();
            store.userToSocket.clear();

            const client = createMockSocket('same-socket');
            service.register(client, { username: username1 });

            client.emit.mockClear();

            // Try to change username
            service.register(client, { username: username2 });

            expect(client.emit).toHaveBeenCalledWith('register-response', {
              success: false,
              message: 'Cannot change username on this connection',
            });

            // Original mapping unchanged
            expect(store.users.get('same-socket')).toBe(trimmed1);
            expect(store.userToSocket.get(trimmed1)).toBe('same-socket');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 7: Disconnect cleanup toàn bộ
   * **Validates: Requirement 6.6**
   *
   * For ANY registered user in ANY number of groups, after disconnect,
   * the user is removed from ALL data stores (users map, userToSocket map, all group memberships).
   */
  describe('Property 7: Disconnect cleanup removes user from all stores', () => {
    it('removes user from users map, userToSocket map, and all group memberships', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          fc.array(fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0), {
            minLength: 0,
            maxLength: 5,
          }),
          (username, groupNames) => {
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            const trimmedUsername = username.trim();
            const socketId = 'disconnect-socket';
            const client = createMockSocket(socketId);

            // Register user
            service.register(client, { username });

            // Create unique groups (deduplicate trimmed names)
            const uniqueGroups = [...new Set(groupNames.map((g) => g.trim()).filter((g) => g.length > 0))];
            for (const groupName of uniqueGroups) {
              service.createGroup(client, { name: groupName });
            }

            // Reset mocks for disconnect
            mockServer.emit.mockClear();
            mockServer.to.mockClear();

            // Disconnect
            service.handleDisconnect(client);

            // Verify: user removed from users map
            expect(store.users.has(socketId)).toBe(false);
            // Verify: username removed from userToSocket
            expect(store.userToSocket.has(trimmedUsername)).toBe(false);
            // Verify: user removed from all groups
            for (const [, group] of store.groups) {
              expect(group.members.has(trimmedUsername)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('empty groups are deleted after disconnect', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          fc.array(fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0), {
            minLength: 1,
            maxLength: 5,
          }),
          (username, groupNames) => {
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            const client = createMockSocket('solo-socket');
            service.register(client, { username });

            // Create groups where user is the sole member
            const uniqueGroups = [...new Set(groupNames.map((g) => g.trim()).filter((g) => g.length > 0))];
            for (const groupName of uniqueGroups) {
              service.createGroup(client, { name: groupName });
            }

            const groupCountBefore = store.groups.size;

            // Disconnect - all groups created by this user (sole member) should be deleted
            service.handleDisconnect(client);

            // Groups where the user was the only member should be deleted
            for (const groupName of uniqueGroups) {
              expect(store.groups.has(groupName)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 8: Unregistered client events bị bỏ qua
   * **Validates: Requirement 11.3**
   *
   * For ANY event payload sent by an unregistered socket,
   * the service does not emit any error or response (silent ignore).
   */
  describe('Property 8: Unregistered client events are silently ignored', () => {
    it('broadcastMessage from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 100 }), (message) => {
          const client = createMockSocket('unregistered-socket');

          service.broadcastMessage(client, { message });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.broadcast.emit).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it('privateMessage from unregistered client does nothing', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          (target, message) => {
            const client = createMockSocket('unregistered-socket');

            service.privateMessage(client, { target, message });

            expect(client.emit).not.toHaveBeenCalled();
            expect(mockServer.to).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('groupMessage from unregistered client does nothing', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          (group, message) => {
            const client = createMockSocket('unregistered-socket');

            service.groupMessage(client, { group, message });

            expect(client.emit).not.toHaveBeenCalled();
            expect(client.to).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('createGroup from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
          const client = createMockSocket('unregistered-socket');
          const groupsBefore = store.groups.size;

          service.createGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(store.groups.size).toBe(groupsBefore);
        }),
        { numRuns: 100 },
      );
    });

    it('joinGroup from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
          const client = createMockSocket('unregistered-socket');

          service.joinGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.join).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it('leaveGroup from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
          const client = createMockSocket('unregistered-socket');

          service.leaveGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.leave).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it('getMyGroups from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const client = createMockSocket('unregistered-socket');

          service.getMyGroups(client);

          expect(client.emit).not.toHaveBeenCalled();
        }),
        { numRuns: 10 },
      );
    });
  });
});
