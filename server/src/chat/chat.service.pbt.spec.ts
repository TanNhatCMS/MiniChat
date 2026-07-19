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
   * Property 1: Registration stores bidirectional mapping
   * **Validates: Requirements 3.1**
   *
   * For ANY valid username, after successful registration,
   * store.users.get(socketId) === username.trim() AND
   * store.userToSocket.get(username.trim()) === socketId.
   */
  describe('Property 1: Registration stores bidirectional mapping', () => {
    it('after successful registration, both maps contain consistent entries', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          (username, socketSuffix) => {
            store.users.clear();
            store.userToSocket.clear();

            const socketId = `socket-${socketSuffix}`;
            const client = createMockSocket(socketId);

            service.register(client, { username });

            const trimmed = username.trim();

            // Verify bidirectional mapping
            expect(store.users.get(socketId)).toBe(trimmed);
            expect(store.userToSocket.get(trimmed)).toBe(socketId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Username validation rejects invalid input
   * Part of Design Property 3: Invalid registration is rejected with correct error
   * **Validates: Requirements 3.4, 3.5** (collectively with Properties 5 & 6 validates Requirements 3.4, 3.5, 3.6, 3.8)
   *
   * For ANY string that is empty OR whitespace-only OR (after trim) longer than 20 chars,
   * register always returns {success: false} and ChatStore remains unchanged.
   */
  describe('Property 4: Username validation rejects invalid input', () => {
    it('rejects empty or whitespace-only usernames and leaves ChatStore unchanged', () => {
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
            // Seed store with an existing user to verify it remains intact
            store.users.set('existing-socket', 'ExistingUser');
            store.userToSocket.set('ExistingUser', 'existing-socket');
            const usersCountBefore = store.users.size;
            const userToSocketCountBefore = store.userToSocket.size;

            const client = createMockSocket('test-socket');
            service.register(client, { username: invalidUsername });

            expect(client.emit).toHaveBeenCalledWith(
              'register-response',
              expect.objectContaining({ success: false }),
            );
            // User should NOT be added to store
            expect(store.users.has('test-socket')).toBe(false);
            expect(store.userToSocket.has('test-socket')).toBe(false);
            // Existing entries remain intact
            expect(store.users.size).toBe(usersCountBefore);
            expect(store.userToSocket.size).toBe(userToSocketCountBefore);
            expect(store.users.get('existing-socket')).toBe('ExistingUser');
            expect(store.userToSocket.get('ExistingUser')).toBe('existing-socket');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rejects usernames longer than 20 chars after trim and leaves ChatStore unchanged', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 21, maxLength: 100 }).filter(
            (s) => s.trim().length > 20,
          ),
          (longUsername) => {
            const client = createMockSocket('test-socket');
            store.users.clear();
            store.userToSocket.clear();

            // Seed store with an existing user to verify it remains intact
            store.users.set('existing-socket', 'ExistingUser');
            store.userToSocket.set('ExistingUser', 'existing-socket');
            const usersCountBefore = store.users.size;
            const userToSocketCountBefore = store.userToSocket.size;

            service.register(client, { username: longUsername });

            expect(client.emit).toHaveBeenCalledWith(
              'register-response',
              expect.objectContaining({ success: false }),
            );
            // User should NOT be added to store
            expect(store.users.has('test-socket')).toBe(false);
            expect(store.userToSocket.has(longUsername.trim())).toBe(false);
            // Existing entries remain intact
            expect(store.users.size).toBe(usersCountBefore);
            expect(store.userToSocket.size).toBe(userToSocketCountBefore);
            expect(store.users.get('existing-socket')).toBe('ExistingUser');
            expect(store.userToSocket.get('ExistingUser')).toBe('existing-socket');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Registration success response is complete
   * **Validates: Requirements 3.2**
   *
   * For ANY successful registration, the emitted register-response SHALL contain
   * success: true, the trimmed username, a list of all other online users, all group names,
   * the user's joined groups, and group member details matching the current ChatStore state.
   */
  describe('Property 2: Registration success response is complete', () => {
    // Generator for unique valid usernames (array of distinct trimmed names)
    const uniqueUsernamesArb = (minLength: number, maxLength: number) =>
      fc
        .uniqueArray(
          validUsernameArb.map((s) => s.trim()),
          { minLength, maxLength, comparator: (a, b) => a === b },
        )
        .filter((arr) => arr.every((u) => u.length >= 1 && u.length <= 20));

    // Generator for group names
    const groupNameArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter((s) => s.trim().length > 0)
      .map((s) => s.trim());

    it('register-response contains all required fields matching store state', () => {
      fc.assert(
        fc.property(
          uniqueUsernamesArb(1, 5),
          fc.array(groupNameArb, { minLength: 0, maxLength: 3 }),
          (usernames, groupNames) => {
            // Fresh state for each run
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            // Deduplicate group names
            const uniqueGroups = [...new Set(groupNames)];

            // The last username is our test user; the rest are "other" users
            const testUsername = usernames[usernames.length - 1];
            const otherUsernames = usernames.slice(0, -1);

            // Register other users first
            for (let i = 0; i < otherUsernames.length; i++) {
              const otherClient = createMockSocket(`other-socket-${i}`);
              service.register(otherClient, { username: otherUsernames[i] });
            }

            // Create groups (using the first other user as creator, or skip if no other users)
            if (otherUsernames.length > 0) {
              const creatorClient = createMockSocket('other-socket-0');
              for (const gName of uniqueGroups) {
                service.createGroup(creatorClient, { name: gName });
              }
            }

            // Register the test user
            const testClient = createMockSocket('test-socket');
            service.register(testClient, { username: testUsername });

            // Get the register-response call
            const emitCalls = testClient.emit.mock.calls;
            const registerResponseCall = emitCalls.find(
              (call: any[]) => call[0] === 'register-response',
            );

            expect(registerResponseCall).toBeDefined();
            const response = registerResponseCall![1];

            // Verify success: true
            expect(response.success).toBe(true);

            // Verify username is trimmed
            expect(response.username).toBe(testUsername);

            // Verify users list matches all other usernames in store
            const expectedUsers = Array.from(store.userToSocket.keys()).filter(
              (u) => u !== testUsername,
            );
            expect([...response.users].sort()).toEqual([...expectedUsers].sort());

            // Verify groups matches store.getAllGroupNames()
            const expectedGroups = store.getAllGroupNames();
            expect([...response.groups].sort()).toEqual([...expectedGroups].sort());

            // Verify myGroups matches store.getUserGroups(username)
            const expectedMyGroups = store.getUserGroups(testUsername);
            expect([...response.myGroups].sort()).toEqual([...expectedMyGroups].sort());

            // Verify groupMembers matches store.getGroupMembers(username)
            const expectedGroupMembers = store.getGroupMembers(testUsername);
            expect(response.groupMembers).toEqual(expectedGroupMembers);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('register-response users list excludes the registering user', () => {
      fc.assert(
        fc.property(
          uniqueUsernamesArb(2, 6),
          (usernames) => {
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            const testUsername = usernames[usernames.length - 1];
            const otherUsernames = usernames.slice(0, -1);

            // Register other users
            for (let i = 0; i < otherUsernames.length; i++) {
              const otherClient = createMockSocket(`other-socket-${i}`);
              service.register(otherClient, { username: otherUsernames[i] });
            }

            // Register test user
            const testClient = createMockSocket('test-socket');
            service.register(testClient, { username: testUsername });

            const emitCalls = testClient.emit.mock.calls;
            const registerResponseCall = emitCalls.find(
              (call: any[]) => call[0] === 'register-response',
            );
            const response = registerResponseCall![1];

            // The test user should NOT appear in the users list
            expect(response.users).not.toContain(testUsername);
            // All other registered users should be in the list
            for (const other of otherUsernames) {
              expect(response.users).toContain(other);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('register-response reflects groups the user belongs to after joining', () => {
      fc.assert(
        fc.property(
          uniqueUsernamesArb(2, 4),
          fc.uniqueArray(groupNameArb, { minLength: 1, maxLength: 3, comparator: (a, b) => a === b }),
          (usernames, groupNames) => {
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            const testUsername = usernames[usernames.length - 1];
            const creatorUsername = usernames[0];

            // Register creator
            const creatorClient = createMockSocket('creator-socket');
            service.register(creatorClient, { username: creatorUsername });

            // Creator creates groups
            for (const gName of groupNames) {
              service.createGroup(creatorClient, { name: gName });
            }

            // Register test user
            const testClient = createMockSocket('test-socket');
            service.register(testClient, { username: testUsername });

            // Test user joins some groups
            const groupsToJoin = groupNames.slice(0, Math.max(1, Math.floor(groupNames.length / 2)));
            for (const gName of groupsToJoin) {
              service.joinGroup(testClient, { name: gName });
            }

            // Now re-register (idempotent) to get updated state
            testClient.emit.mockClear();
            service.register(testClient, { username: testUsername });

            const emitCalls = testClient.emit.mock.calls;
            const registerResponseCall = emitCalls.find(
              (call: any[]) => call[0] === 'register-response',
            );
            const response = registerResponseCall![1];

            expect(response.success).toBe(true);

            // myGroups should match store
            const expectedMyGroups = store.getUserGroups(testUsername);
            expect([...response.myGroups].sort()).toEqual([...expectedMyGroups].sort());

            // groupMembers should match store
            const expectedGroupMembers = store.getGroupMembers(testUsername);
            expect(response.groupMembers).toEqual(expectedGroupMembers);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Username uniqueness enforcement
   * Part of Design Property 3: Invalid registration is rejected with correct error
   * **Validates: Requirement 3.6** (collectively with Properties 4 & 6 validates Requirements 3.4, 3.5, 3.6, 3.8)
   *
   * For ANY valid username, registering the same username from a different socket
   * always returns {success: false, message: "Username already taken"} and ChatStore remains unchanged.
   */
  describe('Property 5: Username uniqueness enforcement', () => {
    it('rejects duplicate username from a different socket and leaves ChatStore unchanged', () => {
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

            const usersCountAfterFirst = store.users.size;
            const userToSocketCountAfterFirst = store.userToSocket.size;

            // Second registration from different socket fails
            service.register(client2, { username: username.trim() });

            expect(client2.emit).toHaveBeenCalledWith('register-response', {
              success: false,
              message: 'Username already taken',
            });

            // Store should still have the original mapping only
            expect(store.users.get(sid1)).toBe(username.trim());
            expect(store.userToSocket.get(username.trim())).toBe(sid1);
            // The rejected socket should NOT be in the store
            expect(store.users.has(sid2)).toBe(false);
            // Map sizes should not change after rejection
            expect(store.users.size).toBe(usersCountAfterFirst);
            expect(store.userToSocket.size).toBe(userToSocketCountAfterFirst);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 6: Re-registration behavior on same socket
   * Part of Design Property 3: Invalid registration is rejected with correct error (for username-change rejection)
   * **Validates: Requirements 3.7, 3.8** (collectively with Properties 4 & 5 validates Requirements 3.4, 3.5, 3.6, 3.8)
   *
   * For ANY registered socket:
   * - Re-registering with same username returns success (idempotent)
   * - Re-registering with different username returns "Cannot change username" and ChatStore remains unchanged
   */
  describe('Property 6: Re-registration behavior on same socket', () => {
    /**
     * Also validates Design Property 4: Idempotent re-registration
     * **Validates: Requirements 3.7**
     *
     * Re-emitting `register` with the same username returns success with current state
     * and creates no duplicate entries in the ChatStore maps.
     */
    it('idempotent re-register with same username returns success and creates no duplicates', () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const client = createMockSocket('same-socket');
          service.register(client, { username });

          const trimmed = username.trim();

          // Verify initial state: exactly 1 entry in each map
          expect(store.users.size).toBe(1);
          expect(store.userToSocket.size).toBe(1);

          // Clear mocks to check second call
          client.emit.mockClear();
          client.broadcast.emit.mockClear();

          // Re-register with same username
          service.register(client, { username: trimmed });

          // Should NOT broadcast user-joined again
          expect(client.broadcast.emit).not.toHaveBeenCalled();

          // Verify no duplicate entries were created (maps still size 1)
          expect(store.users.size).toBe(1);
          expect(store.userToSocket.size).toBe(1);

          // Verify the response includes correct current state
          const emitCalls = client.emit.mock.calls;
          const registerResponseCall = emitCalls.find(
            (call: any[]) => call[0] === 'register-response',
          );
          expect(registerResponseCall).toBeDefined();
          const response = registerResponseCall![1];

          expect(response.success).toBe(true);
          expect(response.username).toBe(trimmed);

          // users list should match all other users in store (excluding self)
          const expectedUsers = Array.from(store.userToSocket.keys()).filter(
            (u) => u !== trimmed,
          );
          expect([...response.users].sort()).toEqual([...expectedUsers].sort());

          // groups should match store.getAllGroupNames()
          const expectedGroups = store.getAllGroupNames();
          expect([...response.groups].sort()).toEqual([...expectedGroups].sort());

          // myGroups should match store.getUserGroups(username)
          const expectedMyGroups = store.getUserGroups(trimmed);
          expect([...response.myGroups].sort()).toEqual([...expectedMyGroups].sort());

          // groupMembers should match store.getGroupMembers(username)
          const expectedGroupMembers = store.getGroupMembers(trimmed);
          expect(response.groupMembers).toEqual(expectedGroupMembers);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects change to different username on same socket and leaves ChatStore unchanged', () => {
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

            const usersCountBefore = store.users.size;
            const userToSocketCountBefore = store.userToSocket.size;

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
            // New username should NOT be added to userToSocket
            expect(store.userToSocket.has(trimmed2)).toBe(false);
            // Map sizes should not change after rejection
            expect(store.users.size).toBe(usersCountBefore);
            expect(store.userToSocket.size).toBe(userToSocketCountBefore);
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
   * Design Property 7: Broadcast message delivery
   * **Validates: Requirements 4.1**
   *
   * For any registered user sending a broadcast message, all other connected sockets
   * SHALL receive a `receive-message` event with `type: "broadcast"`, the sender's username,
   * and the message content. The sender SHALL NOT receive their own broadcast.
   */
  describe('Design Property 7: Broadcast message delivery', () => {
    it('client.broadcast.emit is called with correct payload for any valid username and message', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          fc.string({ minLength: 0, maxLength: 200 }),
          (username, message) => {
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();

            const client = createMockSocket('sender-socket');

            // Register the user
            service.register(client, { username });

            // Clear mocks from registration
            client.emit.mockClear();
            client.broadcast.emit.mockClear();

            // Send broadcast message
            service.broadcastMessage(client, { message });

            const trimmed = username.trim();

            // Verify client.broadcast.emit was called with correct payload
            expect(client.broadcast.emit).toHaveBeenCalledWith('receive-message', {
              sender: trimmed,
              message,
              type: 'broadcast',
            });

            // Verify sender does NOT receive their own broadcast
            expect(client.emit).not.toHaveBeenCalledWith(
              'receive-message',
              expect.anything(),
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 8: Unregistered client events bị bỏ qua
   * Also validates Design Property 5: Unregistered sockets are silently ignored
   * **Validates: Requirements 4.3, 5.4, 6.6, 7.6, 8.6, 9.5, 11.3**
   *
   * For ANY event payload sent by an unregistered socket,
   * the service does not emit any error or response (silent ignore),
   * no state changes occur in ChatStore (stats, groups, users maps unchanged).
   */
  describe('Property 8: Unregistered client events are silently ignored', () => {
    it('broadcastMessage from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 100 }), (message) => {
          const client = createMockSocket('unregistered-socket');
          const statsBefore = { ...store.stats };

          service.broadcastMessage(client, { message });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.broadcast.emit).not.toHaveBeenCalled();
          expect(mockServer.to).not.toHaveBeenCalled();
          expect(store.stats.totalMessages).toBe(statsBefore.totalMessages);
          expect(store.stats.totalBroadcasts).toBe(statsBefore.totalBroadcasts);
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
            const statsBefore = { ...store.stats };

            service.privateMessage(client, { target, message });

            expect(client.emit).not.toHaveBeenCalled();
            expect(mockServer.to).not.toHaveBeenCalled();
            expect(store.stats.totalMessages).toBe(statsBefore.totalMessages);
            expect(store.stats.totalPrivateMessages).toBe(statsBefore.totalPrivateMessages);
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
            const statsBefore = { ...store.stats };

            service.groupMessage(client, { group, message });

            expect(client.emit).not.toHaveBeenCalled();
            expect(client.to).not.toHaveBeenCalled();
            expect(mockServer.to).not.toHaveBeenCalled();
            expect(store.stats.totalMessages).toBe(statsBefore.totalMessages);
            expect(store.stats.totalGroupMessages).toBe(statsBefore.totalGroupMessages);
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
          const usersBefore = store.users.size;

          service.createGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.join).not.toHaveBeenCalled();
          expect(mockServer.to).not.toHaveBeenCalled();
          expect(store.groups.size).toBe(groupsBefore);
          expect(store.users.size).toBe(usersBefore);
        }),
        { numRuns: 100 },
      );
    });

    it('joinGroup from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
          const client = createMockSocket('unregistered-socket');
          const groupsSnapshot = new Map(
            Array.from(store.groups.entries()).map(([k, v]) => [k, { ...v, members: new Set(v.members) }]),
          );

          service.joinGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.join).not.toHaveBeenCalled();
          expect(mockServer.to).not.toHaveBeenCalled();
          // Verify no group membership changes
          for (const [groupName, groupData] of store.groups) {
            const before = groupsSnapshot.get(groupName);
            if (before) {
              expect(groupData.members.size).toBe(before.members.size);
            }
          }
        }),
        { numRuns: 100 },
      );
    });

    it('leaveGroup from unregistered client does nothing', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 50 }), (name) => {
          const client = createMockSocket('unregistered-socket');
          const groupsSnapshot = new Map(
            Array.from(store.groups.entries()).map(([k, v]) => [k, { ...v, members: new Set(v.members) }]),
          );
          const groupCountBefore = store.groups.size;

          service.leaveGroup(client, { name });

          expect(client.emit).not.toHaveBeenCalled();
          expect(client.leave).not.toHaveBeenCalled();
          expect(mockServer.to).not.toHaveBeenCalled();
          // Verify no group state changes
          expect(store.groups.size).toBe(groupCountBefore);
          for (const [groupName, groupData] of store.groups) {
            const before = groupsSnapshot.get(groupName);
            if (before) {
              expect(groupData.members.size).toBe(before.members.size);
            }
          }
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


/**
 * Design Property 6 (distinct from file's "Property 6" which covers re-registration)
 *
 * Property 6: Message counters are consistent
 * **Validates: Requirements 1.2, 4.2, 5.2, 9.2**
 *
 * After any sequence of broadcast, private, and group messages,
 * stats.totalMessages === stats.totalBroadcasts + stats.totalPrivateMessages + stats.totalGroupMessages,
 * and each sub-counter equals the count of its respective successful operations.
 */
describe('Property 6: Message counters are consistent', () => {
  it('totalMessages === totalBroadcasts + totalPrivateMessages + totalGroupMessages after random operations', () => {
    fc.assert(
      fc.property(
        // Number of users (2-4)
        fc.integer({ min: 2, max: 4 }),
        // Number of groups (1-2)
        fc.integer({ min: 1, max: 2 }),
        // Sequence of message commands (indices will be bounded at runtime)
        fc.array(
          fc.oneof(
            fc.record({
              type: fc.constant('broadcast' as const),
              senderIdx: fc.integer({ min: 0, max: 3 }),
              message: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            fc.record({
              type: fc.constant('private' as const),
              senderIdx: fc.integer({ min: 0, max: 3 }),
              targetIdx: fc.integer({ min: 0, max: 3 }),
              message: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            fc.record({
              type: fc.constant('group' as const),
              senderIdx: fc.integer({ min: 0, max: 3 }),
              groupIdx: fc.integer({ min: 0, max: 1 }),
              message: fc.string({ minLength: 1, maxLength: 50 }),
            }),
          ),
          { minLength: 1, maxLength: 20 },
        ),
        (numUsers, numGroups, commands) => {
          // Fresh state for each property run
          const store = new ChatStore();
          const service = new ChatService(store, createMockServerMonitor());
          const mockServer = createMockServer();
          service.setServer(mockServer);

          // Setup: register users
          const usernames = Array.from({ length: numUsers }, (_, i) => `user${i}`);
          const sockets = usernames.map((_, i) => createMockSocket(`socket-${i}`));

          for (let i = 0; i < numUsers; i++) {
            service.register(sockets[i], { username: usernames[i] });
          }

          // Setup: create groups and have all users join
          const groupNames = Array.from({ length: numGroups }, (_, i) => `group${i}`);
          for (const gName of groupNames) {
            service.createGroup(sockets[0], { name: gName });
          }
          // Other users join all groups
          for (let u = 1; u < numUsers; u++) {
            for (const gName of groupNames) {
              service.joinGroup(sockets[u], { name: gName });
            }
          }

          // Track expected sub-counters
          let expectedBroadcasts = 0;
          let expectedPrivates = 0;
          let expectedGroupMsgs = 0;

          // Execute random commands
          for (const cmd of commands) {
            const senderIdx = cmd.senderIdx % numUsers;
            const sender = sockets[senderIdx];

            switch (cmd.type) {
              case 'broadcast':
                service.broadcastMessage(sender, { message: cmd.message });
                expectedBroadcasts++;
                break;
              case 'private': {
                const targetIdx = cmd.targetIdx % numUsers;
                const targetUsername = usernames[targetIdx];
                service.privateMessage(sender, { target: targetUsername, message: cmd.message });
                // Private message always succeeds when target is a registered user
                expectedPrivates++;
                break;
              }
              case 'group': {
                const groupIdx = cmd.groupIdx % numGroups;
                const groupName = groupNames[groupIdx];
                service.groupMessage(sender, { group: groupName, message: cmd.message });
                // All users are members of all groups, so this always succeeds
                expectedGroupMsgs++;
                break;
              }
            }
          }

          // Verify consistency: totalMessages === sum of sub-counters
          expect(store.stats.totalMessages).toBe(
            store.stats.totalBroadcasts + store.stats.totalPrivateMessages + store.stats.totalGroupMessages,
          );

          // Verify each sub-counter equals the expected count
          expect(store.stats.totalBroadcasts).toBe(expectedBroadcasts);
          expect(store.stats.totalPrivateMessages).toBe(expectedPrivates);
          expect(store.stats.totalGroupMessages).toBe(expectedGroupMsgs);
          expect(store.stats.totalMessages).toBe(expectedBroadcasts + expectedPrivates + expectedGroupMsgs);
        },
      ),
      { numRuns: 100 },
    );
  });
});


describe('Design Property 8: Private message targets only the recipient', () => {
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
   * Property 8: Private message targets only the recipient
   * **Validates: Requirements 5.1**
   *
   * For any registered sender and valid target username, the `receive-message` event
   * with `type: "private"` SHALL be emitted only to the target user's socket and to no other socket.
   */
  it('private message is delivered only to the target socket', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        validUsernameArb,
        fc.string({ minLength: 0, maxLength: 200 }),
        (senderUsername, targetUsername, message) => {
          const senderTrimmed = senderUsername.trim();
          const targetTrimmed = targetUsername.trim();

          // Ensure distinct usernames
          if (senderTrimmed === targetTrimmed) return;

          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          const senderSocketId = 'sender-socket';
          const targetSocketId = 'target-socket';
          const senderClient = createMockSocket(senderSocketId);
          const targetClient = createMockSocket(targetSocketId);

          // Register both users
          service.register(senderClient, { username: senderUsername });
          service.register(targetClient, { username: targetUsername });

          // Clear mocks after registration
          senderClient.emit.mockClear();
          senderClient.broadcast.emit.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // Send private message
          service.privateMessage(senderClient, { target: targetTrimmed, message });

          // Verify server.to was called with the target's socket ID
          expect(mockServer.to).toHaveBeenCalledWith(targetSocketId);

          // Verify the chained .emit was called with correct payload
          expect(mockServer.__toEmit).toHaveBeenCalledWith('receive-message', {
            sender: senderTrimmed,
            message,
            type: 'private',
            target: targetTrimmed,
          });

          // Verify sender did NOT receive the message via direct emit
          expect(senderClient.emit).not.toHaveBeenCalledWith(
            'receive-message',
            expect.anything(),
          );

          // Verify sender's broadcast was NOT used
          expect(senderClient.broadcast.emit).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 14: Leave group removes membership
 * **Validates: Requirements 8.1, 8.2**
 *
 * For any two distinct valid usernames and any valid group name,
 * when user2 leaves a group they joined, they are removed from the members Set,
 * `client.leave` is called with the room name, and `group-member-left` is emitted
 * to remaining room members.
 */
describe('Property 14: Leave group removes membership', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  it('leaving a group removes user from members, calls client.leave, and emits group-member-left', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        validUsernameArb,
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0).map((s) => s.trim()),
        (user1Username, user2Username, groupName) => {
          const user1Trimmed = user1Username.trim();
          const user2Trimmed = user2Username.trim();

          // Ensure distinct usernames
          if (user1Trimmed === user2Trimmed) return;

          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const client1 = createMockSocket('socket-user1');
          const client2 = createMockSocket('socket-user2');

          // Register user1 (creator) and user2
          service.register(client1, { username: user1Username });
          service.register(client2, { username: user2Username });

          // user1 creates the group
          service.createGroup(client1, { name: groupName });

          // user2 joins the group
          service.joinGroup(client2, { name: groupName });

          // Verify user2 is in group members before leaving
          expect(store.groups.get(groupName)!.members.has(user2Trimmed)).toBe(true);

          // Clear mocks before leave operation
          client2.leave.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // user2 leaves the group
          service.leaveGroup(client2, { name: groupName });

          // Verify user2 is removed from group members
          const group = store.groups.get(groupName);
          if (group) {
            expect(group.members.has(user2Trimmed)).toBe(false);
          }

          // Verify client2.leave was called with the room name
          expect(client2.leave).toHaveBeenCalledWith(`group:${groupName}`);

          // Verify group-member-left was emitted to the remaining room
          expect(mockServer.to).toHaveBeenCalledWith(`group:${groupName}`);
          expect(mockServer.__toEmit).toHaveBeenCalledWith('group-member-left', {
            group: groupName,
            username: user2Trimmed,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 9: Private message to offline user returns error
 * **Validates: Requirements 5.3**
 *
 * For any valid sender username and any target username that is NOT registered
 * in userToSocket, calling privateMessage emits an error event to the sender
 * with "User not found or offline" and does not increment any message counters.
 */
describe('Property 9: Private message to offline user returns error', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  it('emits error to sender and does not increment counters when target is offline', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        validUsernameArb,
        fc.string({ minLength: 0, maxLength: 200 }),
        (senderUsername, baseTargetUsername, message) => {
          // Guarantee target is NOT in userToSocket by appending a unique suffix
          const offlineUsername = `${baseTargetUsername.trim()}_offline_${Date.now()}`;

          // Fresh state
          store.users.clear();
          store.userToSocket.clear();

          const senderClient = createMockSocket('sender-socket');

          // Register sender
          service.register(senderClient, { username: senderUsername });

          // Snapshot counters before private message attempt
          const totalMessagesBefore = store.stats.totalMessages;
          const totalPrivateMessagesBefore = store.stats.totalPrivateMessages;

          // Clear mocks after registration (registration triggers broadcastDashboardStats)
          senderClient.emit.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // Send private message to offline user
          service.privateMessage(senderClient, { target: offlineUsername, message });

          // Verify error emitted to sender
          expect(senderClient.emit).toHaveBeenCalledWith('error', {
            message: 'User not found or offline',
          });

          // Verify counters did NOT increase
          expect(store.stats.totalMessages).toBe(totalMessagesBefore);
          expect(store.stats.totalPrivateMessages).toBe(totalPrivateMessagesBefore);

          // Verify mockServer.to was NOT called (no message delivered)
          expect(mockServer.to).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 10: Group creation initializes correct state
 * **Validates: Requirements 6.1, 6.2**
 *
 * For any valid group name (non-empty, not already existing) and registered creator,
 * after `create-group` the ChatStore SHALL contain a group entry with `creator === username`
 * and `members` containing exactly the creator, and the creator's socket SHALL have joined
 * room "group:{name}".
 */
describe('Property 10: Group creation initializes correct state', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  // Generator for valid group names (non-empty, 1-15 chars after trim)
  const validGroupNameArb = fc
    .string({ minLength: 1, maxLength: 15 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim());

  it('after create-group, store contains group with correct creator, members, and client.join was called', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        validGroupNameArb,
        (username, groupName) => {
          // Fresh state for each run
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const socketId = 'creator-socket';
          const client = createMockSocket(socketId);

          // Register the user
          service.register(client, { username });

          // Clear mocks after registration
          client.join.mockClear();

          // Create the group
          service.createGroup(client, { name: groupName });

          const trimmedUsername = username.trim();

          // Verify store.groups.has(groupName) is true
          expect(store.groups.has(groupName)).toBe(true);

          // Verify store.groups.get(groupName).creator === username.trim()
          const group = store.groups.get(groupName)!;
          expect(group.creator).toBe(trimmedUsername);

          // Verify store.groups.get(groupName).members contains exactly the creator
          expect(group.members.size).toBe(1);
          expect(group.members.has(trimmedUsername)).toBe(true);

          // Verify client.join was called with "group:{groupName}"
          expect(client.join).toHaveBeenCalledWith(`group:${groupName}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 12: Join group adds membership and room
 * **Validates: Requirements 7.1, 7.2**
 *
 * For any two distinct valid usernames and any valid group name,
 * when a non-member joins an existing group:
 * - The joiner is added to the group's members Set
 * - `client.join` is called with the room name `"group:{groupName}"`
 * - `group-member-joined` is emitted to the room with the group name and joiner's username
 */
describe('Property 12: Join group adds membership and room', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  // Generator for valid group names (1-15 chars after trim, non-empty)
  const validGroupNameArb = fc
    .string({ minLength: 1, maxLength: 15 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim());

  it('joining a group adds member to Set, calls client.join, and emits group-member-joined', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        validUsernameArb,
        validGroupNameArb,
        (user1Username, user2Username, groupName) => {
          const user1Trimmed = user1Username.trim();
          const user2Trimmed = user2Username.trim();

          // Ensure distinct usernames
          if (user1Trimmed === user2Trimmed) return;

          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const client1 = createMockSocket('socket-creator');
          const client2 = createMockSocket('socket-joiner');

          // Register user1 (group creator)
          service.register(client1, { username: user1Username });
          // Register user2 (joiner)
          service.register(client2, { username: user2Username });

          // user1 creates the group
          service.createGroup(client1, { name: groupName });

          // Clear mocks before the join action we want to test
          client2.join.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // user2 joins the group
          service.joinGroup(client2, { name: groupName });

          // Verify: user2 is added to the group's members Set
          const group = store.groups.get(groupName);
          expect(group).toBeDefined();
          expect(group!.members.has(user2Trimmed)).toBe(true);

          // Verify: client2.join was called with the room name
          expect(client2.join).toHaveBeenCalledWith(`group:${groupName}`);

          // Verify: group-member-joined emitted to room
          expect(mockServer.to).toHaveBeenCalledWith(`group:${groupName}`);
          expect(mockServer.__toEmit).toHaveBeenCalledWith('group-member-joined', {
            group: groupName,
            username: user2Trimmed,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 11: Group creation validation
 * **Validates: Requirements 6.4, 6.5**
 *
 * For any group name that is empty/missing or already exists in the ChatStore,
 * `create-group` SHALL emit an `error` event with the appropriate message
 * and SHALL NOT modify the groups map.
 */
describe('Property 11: Group creation validation', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  it('emits error "Group name is required" for empty/whitespace-only names and does not modify groups', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant(undefined as unknown as string),
          fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 30 }),
          fc.stringOf(
            fc.oneof(fc.constant(' '), fc.constant('\t'), fc.constant('\n')),
            { minLength: 1, maxLength: 30 },
          ),
        ),
        (invalidName) => {
          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          // Register a user so the createGroup guard passes the "unregistered" check
          const client = createMockSocket('creator-socket');
          service.register(client, { username: 'TestUser' });

          // Seed a pre-existing group to verify it remains untouched
          store.groups.set('ExistingGroup', {
            creator: 'TestUser',
            members: new Set(['TestUser']),
          });
          const groupsCountBefore = store.groups.size;

          // Clear mocks after setup
          client.emit.mockClear();
          client.join.mockClear();

          // Attempt to create group with invalid name
          service.createGroup(client, { name: invalidName });

          // Verify error event emitted
          expect(client.emit).toHaveBeenCalledWith('error', {
            message: 'Group name is required',
          });

          // Verify groups map unchanged
          expect(store.groups.size).toBe(groupsCountBefore);
          expect(store.groups.has('ExistingGroup')).toBe(true);

          // Verify client.join was NOT called (no room joined)
          expect(client.join).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('emits error "Group already exists" for duplicate group names and does not modify groups', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s.trim().length > 0),
        validUsernameArb,
        validUsernameArb,
        (groupName, creatorUsername, secondUsername) => {
          const trimmedCreator = creatorUsername.trim();
          const trimmedSecond = secondUsername.trim();

          // Ensure distinct usernames
          if (trimmedCreator === trimmedSecond) return;

          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          // Register creator and create the group
          const creatorClient = createMockSocket('creator-socket');
          service.register(creatorClient, { username: creatorUsername });
          service.createGroup(creatorClient, { name: groupName.trim() });

          // Register a second user who will attempt to create the same group
          const secondClient = createMockSocket('second-socket');
          service.register(secondClient, { username: secondUsername });

          // Snapshot groups state before duplicate attempt
          const groupsCountBefore = store.groups.size;
          const groupDataBefore = store.groups.get(groupName.trim());
          const membersBefore = groupDataBefore
            ? new Set(groupDataBefore.members)
            : new Set();

          // Clear mocks
          secondClient.emit.mockClear();
          secondClient.join.mockClear();

          // Attempt to create group with already-existing name
          service.createGroup(secondClient, { name: groupName.trim() });

          // Verify error event emitted
          expect(secondClient.emit).toHaveBeenCalledWith('error', {
            message: 'Group already exists',
          });

          // Verify groups map not modified
          expect(store.groups.size).toBe(groupsCountBefore);

          // Verify original group data is unchanged
          const groupDataAfter = store.groups.get(groupName.trim());
          expect(groupDataAfter).toBeDefined();
          expect(groupDataAfter!.creator).toBe(trimmedCreator);
          expect(groupDataAfter!.members).toEqual(membersBefore);

          // Verify client.join was NOT called
          expect(secondClient.join).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 13: Join group validation errors
 * **Validates: Requirements 7.4, 7.5**
 *
 * For non-existent group or already-member user, verify `error` event with correct message
 * and no state modification.
 */
describe('Property 13: Join group validation errors', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    store = new ChatStore();
    service = new ChatService(store, createMockServerMonitor());
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  it('emits "Group not found" error when joining a non-existent group and makes no state changes', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        (username, groupName) => {
          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const client = createMockSocket('test-socket');

          // Register the user
          service.register(client, { username });

          // Ensure group does NOT exist
          const trimmedGroup = groupName.trim();
          store.groups.delete(trimmedGroup);

          // Snapshot state before joinGroup attempt
          const groupsCountBefore = store.groups.size;
          const usersCountBefore = store.users.size;
          const userToSocketCountBefore = store.userToSocket.size;

          // Clear mocks
          client.emit.mockClear();
          client.join.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // Attempt to join non-existent group
          service.joinGroup(client, { name: trimmedGroup });

          // Verify error emitted
          expect(client.emit).toHaveBeenCalledWith('error', {
            message: 'Group not found',
          });

          // Verify no state changes
          expect(store.groups.size).toBe(groupsCountBefore);
          expect(store.users.size).toBe(usersCountBefore);
          expect(store.userToSocket.size).toBe(userToSocketCountBefore);

          // Verify client did NOT join any room
          expect(client.join).not.toHaveBeenCalled();

          // Verify no group-member-joined emitted
          expect(mockServer.to).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('emits "Already a member of this group" error when user is already a member and group size unchanged', () => {
    fc.assert(
      fc.property(
        validUsernameArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        (username, groupName) => {
          // Fresh state
          store.users.clear();
          store.userToSocket.clear();
          store.groups.clear();

          const trimmedGroup = groupName.trim();
          const client = createMockSocket('test-socket');

          // Register user
          service.register(client, { username });

          // Create group (user is auto-added as member)
          service.createGroup(client, { name: trimmedGroup });

          // Verify group exists and user is a member
          const group = store.groups.get(trimmedGroup);
          expect(group).toBeDefined();
          expect(group!.members.has(username.trim())).toBe(true);

          // Snapshot state before second joinGroup attempt
          const membersSizeBefore = group!.members.size;
          const groupsCountBefore = store.groups.size;

          // Clear mocks
          client.emit.mockClear();
          client.join.mockClear();
          mockServer.to.mockClear();
          mockServer.__toEmit.mockClear();

          // Attempt to join the group again
          service.joinGroup(client, { name: trimmedGroup });

          // Verify error emitted
          expect(client.emit).toHaveBeenCalledWith('error', {
            message: 'Already a member of this group',
          });

          // Verify group members size is unchanged
          expect(group!.members.size).toBe(membersSizeBefore);

          // Verify no additional state changes
          expect(store.groups.size).toBe(groupsCountBefore);

          // Verify client did NOT join room again
          expect(client.join).not.toHaveBeenCalled();

          // Verify no group-member-joined emitted
          expect(mockServer.to).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
