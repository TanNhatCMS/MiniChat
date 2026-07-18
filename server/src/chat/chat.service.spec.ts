import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from './chat.service';
import { ChatStore } from '../shared/stores/chat.store';
import { ServerMonitorService } from '../shared/server-monitor.service';

function createMockSocket(id = 'socket1') {
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

describe('ChatService', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;
  let mockServerMonitor: ServerMonitorService;

  beforeEach(() => {
    store = new ChatStore();
    mockServerMonitor = createMockServerMonitor();
    service = new ChatService(store, mockServerMonitor);
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  describe('register', () => {
    it('success: registers user, emits register-response with success=true, broadcasts user-joined', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: 'alice' });

      expect(client.emit).toHaveBeenCalledWith('register-response', expect.objectContaining({
        success: true,
        username: 'alice',
      }));
      expect(client.broadcast.emit).toHaveBeenCalledWith('user-joined', { username: 'alice' });
      expect(store.users.get('s1')).toBe('alice');
      expect(store.userToSocket.get('alice')).toBe('s1');
    });

    it('empty username: emits register-response with success=false', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: '' });

      expect(client.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Username is required',
      });
      expect(store.users.size).toBe(0);
    });

    it('whitespace-only username: emits "Username is required"', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: '   ' });

      expect(client.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Username is required',
      });
    });

    it('undefined username: emits "Username is required"', () => {
      const client = createMockSocket('s1');

      service.register(client, {});

      expect(client.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Username is required',
      });
    });

    it('duplicate username (different socket): emits "Username already taken"', () => {
      const client1 = createMockSocket('s1');
      const client2 = createMockSocket('s2');

      service.register(client1, { username: 'alice' });
      service.register(client2, { username: 'alice' });

      expect(client2.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Username already taken',
      });
    });

    it('too long (>20 chars): emits "Username too long (max 20 chars)"', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: 'a'.repeat(21) });

      expect(client.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Username too long (max 20 chars)',
      });
    });

    it('idempotent (same socket, same name): emits success without re-registering', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: 'alice' });
      client.emit.mockClear();
      client.broadcast.emit.mockClear();

      service.register(client, { username: 'alice' });

      expect(client.emit).toHaveBeenCalledWith('register-response', expect.objectContaining({
        success: true,
        username: 'alice',
      }));
      // Should not broadcast user-joined again
      expect(client.broadcast.emit).not.toHaveBeenCalled();
    });

    it('change rejection (same socket, different name): emits "Cannot change username on this connection"', () => {
      const client = createMockSocket('s1');

      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.register(client, { username: 'bob' });

      expect(client.emit).toHaveBeenCalledWith('register-response', {
        success: false,
        message: 'Cannot change username on this connection',
      });
    });
  });

  describe('broadcastMessage', () => {
    it('success: emits receive-message via client.broadcast.emit with type "broadcast"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.broadcast.emit.mockClear();

      service.broadcastMessage(client, { message: 'hello everyone' });

      expect(client.broadcast.emit).toHaveBeenCalledWith('receive-message', {
        sender: 'alice',
        message: 'hello everyone',
        type: 'broadcast',
      });
      expect(store.stats.totalMessages).toBe(1);
      expect(store.stats.totalBroadcasts).toBe(1);
    });

    it('unregistered client: silently returns (no emit)', () => {
      const client = createMockSocket('s1');

      service.broadcastMessage(client, { message: 'hello' });

      expect(client.broadcast.emit).not.toHaveBeenCalled();
    });
  });

  describe('privateMessage', () => {
    it('success: emits receive-message to target socket', () => {
      const client1 = createMockSocket('s1');
      const client2 = createMockSocket('s2');
      service.register(client1, { username: 'alice' });
      service.register(client2, { username: 'bob' });

      service.privateMessage(client1, { target: 'bob', message: 'hi bob' });

      expect(mockServer.to).toHaveBeenCalledWith('s2');
      expect(mockServer.__toEmit).toHaveBeenCalledWith('receive-message', {
        sender: 'alice',
        message: 'hi bob',
        type: 'private',
        target: 'bob',
      });
      expect(store.stats.totalPrivateMessages).toBe(1);
    });

    it('user not found: emits error "User not found or offline"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.privateMessage(client, { target: 'nonexistent', message: 'hi' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'User not found or offline' });
    });

    it('unregistered client: silently returns', () => {
      const client = createMockSocket('s1');

      service.privateMessage(client, { target: 'bob', message: 'hi' });

      expect(client.emit).not.toHaveBeenCalled();
      expect(mockServer.to).not.toHaveBeenCalled();
    });
  });

  describe('groupMessage', () => {
    it('success: emits to room via client.to("group:name").emit', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      store.groups.set('devs', { creator: 'alice', members: new Set(['alice']) });
      client.emit.mockClear();
      client.to.mockClear();

      service.groupMessage(client, { group: 'devs', message: 'hello devs' });

      expect(client.to).toHaveBeenCalledWith('group:devs');
      expect(client.emit).toHaveBeenCalledWith('receive-message', {
        sender: 'alice',
        message: 'hello devs',
        type: 'group',
        group: 'devs',
      });
      expect(store.stats.totalGroupMessages).toBe(1);
    });

    it('not a member: emits error "Not a member of this group"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      store.groups.set('devs', { creator: 'bob', members: new Set(['bob']) });
      client.emit.mockClear();

      service.groupMessage(client, { group: 'devs', message: 'hi' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Not a member of this group' });
    });

    it('group not found: emits error "Group not found"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.groupMessage(client, { group: 'nonexistent', message: 'hi' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group not found' });
    });
  });

  describe('createGroup', () => {
    it('success: creates group in store, joins room, calls broadcastGroupsUpdated', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });

      service.createGroup(client, { name: 'devs' });

      expect(store.groups.has('devs')).toBe(true);
      expect(store.groups.get('devs')!.creator).toBe('alice');
      expect(store.groups.get('devs')!.members.has('alice')).toBe(true);
      expect(client.join).toHaveBeenCalledWith('group:devs');
      // broadcastGroupsUpdated sends groups-updated to each user
      expect(mockServer.to).toHaveBeenCalledWith('s1');
      expect(mockServer.__toEmit).toHaveBeenCalledWith('groups-updated', expect.objectContaining({
        groups: ['devs'],
      }));
    });

    it('empty name: emits error "Group name is required"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.createGroup(client, { name: '' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group name is required' });
    });

    it('undefined name: emits error "Group name is required"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.createGroup(client, {});

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group name is required' });
    });

    it('duplicate name: emits error "Group already exists"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      service.createGroup(client, { name: 'devs' });
      client.emit.mockClear();

      service.createGroup(client, { name: 'devs' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group already exists' });
    });
  });

  describe('joinGroup', () => {
    it('success: adds member, joins room, emits group-member-joined', () => {
      const client1 = createMockSocket('s1');
      const client2 = createMockSocket('s2');
      service.register(client1, { username: 'alice' });
      service.register(client2, { username: 'bob' });
      service.createGroup(client1, { name: 'devs' });
      mockServer.to.mockClear();
      mockServer.__toEmit.mockClear();

      service.joinGroup(client2, { name: 'devs' });

      expect(store.groups.get('devs')!.members.has('bob')).toBe(true);
      expect(client2.join).toHaveBeenCalledWith('group:devs');
      expect(mockServer.to).toHaveBeenCalledWith('group:devs');
      expect(mockServer.__toEmit).toHaveBeenCalledWith('group-member-joined', {
        group: 'devs',
        username: 'bob',
      });
    });

    it('already a member: emits error "Already a member of this group"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      service.createGroup(client, { name: 'devs' });
      client.emit.mockClear();

      service.joinGroup(client, { name: 'devs' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Already a member of this group' });
    });

    it('group not found: emits error "Group not found"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.joinGroup(client, { name: 'nonexistent' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group not found' });
    });
  });

  describe('leaveGroup', () => {
    it('success: removes member, leaves room, emits group-member-left', () => {
      const client1 = createMockSocket('s1');
      const client2 = createMockSocket('s2');
      service.register(client1, { username: 'alice' });
      service.register(client2, { username: 'bob' });
      service.createGroup(client1, { name: 'devs' });
      service.joinGroup(client2, { name: 'devs' });
      mockServer.to.mockClear();
      mockServer.__toEmit.mockClear();

      service.leaveGroup(client2, { name: 'devs' });

      expect(store.groups.get('devs')!.members.has('bob')).toBe(false);
      expect(client2.leave).toHaveBeenCalledWith('group:devs');
      expect(mockServer.to).toHaveBeenCalledWith('group:devs');
      expect(mockServer.__toEmit).toHaveBeenCalledWith('group-member-left', {
        group: 'devs',
        username: 'bob',
      });
    });

    it('empty group deletion: group is deleted when last member leaves', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      service.createGroup(client, { name: 'devs' });
      expect(store.groups.has('devs')).toBe(true);

      service.leaveGroup(client, { name: 'devs' });

      expect(store.groups.has('devs')).toBe(false);
    });

    it('group not found: emits error "Group not found"', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      client.emit.mockClear();

      service.leaveGroup(client, { name: 'nonexistent' });

      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Group not found' });
    });
  });

  describe('disconnect', () => {
    it('cleanupUser: removes user from store, removes from groups, emits user-left, deletes empty groups', () => {
      const client = createMockSocket('s1');
      service.register(client, { username: 'alice' });
      service.createGroup(client, { name: 'devs' });
      mockServer.emit.mockClear();
      mockServer.to.mockClear();
      mockServer.__toEmit.mockClear();

      service.handleDisconnect(client);

      // User removed
      expect(store.users.has('s1')).toBe(false);
      expect(store.userToSocket.has('alice')).toBe(false);
      // Group deleted (alice was only member)
      expect(store.groups.has('devs')).toBe(false);
      // Broadcasted user-left
      expect(mockServer.emit).toHaveBeenCalledWith('user-left', { username: 'alice' });
    });

    it('removes user from group but keeps group if other members remain', () => {
      const client1 = createMockSocket('s1');
      const client2 = createMockSocket('s2');
      service.register(client1, { username: 'alice' });
      service.register(client2, { username: 'bob' });
      service.createGroup(client1, { name: 'devs' });
      service.joinGroup(client2, { name: 'devs' });
      mockServer.emit.mockClear();

      service.handleDisconnect(client1);

      // alice removed from group
      expect(store.groups.get('devs')!.members.has('alice')).toBe(false);
      // Group still exists because bob is a member
      expect(store.groups.has('devs')).toBe(true);
      expect(store.groups.get('devs')!.members.has('bob')).toBe(true);
    });

    it('unregistered socket disconnect does nothing', () => {
      const client = createMockSocket('s1');

      service.handleDisconnect(client);

      expect(mockServer.emit).not.toHaveBeenCalled();
    });
  });
});
