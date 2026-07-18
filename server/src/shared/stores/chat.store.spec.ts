import { describe, it, expect, beforeEach } from 'vitest';
import { ChatStore } from './chat.store';

describe('ChatStore', () => {
  let store: ChatStore;

  beforeEach(() => {
    store = new ChatStore();
  });

  describe('addLog()', () => {
    it('should add a log entry at the beginning of the array', () => {
      const log = store.addLog('test-action', 'test details');
      expect(log.action).toBe('test-action');
      expect(log.details).toBe('test details');
      expect(log.timestamp).toBeTruthy();
      expect(store.activityLogs[0]).toBe(log);
    });

    it('should maintain newest-first order (unshift behavior)', () => {
      store.addLog('first', 'first log');
      store.addLog('second', 'second log');
      store.addLog('third', 'third log');

      expect(store.activityLogs[0].action).toBe('third');
      expect(store.activityLogs[1].action).toBe('second');
      expect(store.activityLogs[2].action).toBe('first');
    });

    it('should cap logs at 100 entries (FIFO)', () => {
      for (let i = 0; i < 110; i++) {
        store.addLog('action', `log ${i}`);
      }
      expect(store.activityLogs.length).toBe(100);
      // Newest first
      expect(store.activityLogs[0].details).toBe('log 109');
      // Oldest surviving entry
      expect(store.activityLogs[99].details).toBe('log 10');
    });
  });

  describe('getDashboardStats()', () => {
    it('should return correct stats structure', () => {
      store.userToSocket.set('alice', 'socket1');
      store.groups.set('devs', { creator: 'alice', members: new Set(['alice']) });
      store.stats.totalMessages = 5;

      const stats = store.getDashboardStats();
      expect(stats.onlineUsers).toBe(1);
      expect(stats.activeGroups).toBe(1);
      expect(stats.totalMessages).toBe(5);
      expect(stats.users).toEqual(['alice']);
      expect(stats.groups).toEqual([
        { name: 'devs', creator: 'alice', memberCount: 1, members: ['alice'] },
      ]);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllGroupNames()', () => {
    it('should return all group names', () => {
      store.groups.set('group1', { creator: 'a', members: new Set(['a']) });
      store.groups.set('group2', { creator: 'b', members: new Set(['b']) });
      expect(store.getAllGroupNames()).toEqual(['group1', 'group2']);
    });
  });

  describe('getUserGroups()', () => {
    it('should return groups the user belongs to', () => {
      store.groups.set('g1', { creator: 'alice', members: new Set(['alice', 'bob']) });
      store.groups.set('g2', { creator: 'bob', members: new Set(['bob']) });
      store.groups.set('g3', { creator: 'alice', members: new Set(['alice']) });

      expect(store.getUserGroups('alice')).toEqual(['g1', 'g3']);
      expect(store.getUserGroups('bob')).toEqual(['g1', 'g2']);
      expect(store.getUserGroups('charlie')).toEqual([]);
    });
  });

  describe('getGroupMembers()', () => {
    it('should return members of groups the user belongs to', () => {
      store.groups.set('g1', { creator: 'alice', members: new Set(['alice', 'bob']) });
      store.groups.set('g2', { creator: 'bob', members: new Set(['bob']) });

      const result = store.getGroupMembers('alice');
      expect(result).toEqual({ g1: ['alice', 'bob'] });

      const bobResult = store.getGroupMembers('bob');
      expect(bobResult).toEqual({ g1: ['alice', 'bob'], g2: ['bob'] });
    });
  });
});
