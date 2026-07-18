import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ApiController } from './api.controller';
import { ChatStore } from '../shared/stores/chat.store';

describe('ApiController - Property Tests', () => {
  let controller: ApiController;
  let store: ChatStore;

  beforeEach(() => {
    store = new ChatStore();
    controller = new ApiController(store);
  });

  /**
   * **Property 11: REST API chỉ trả JSON**
   * **Validates: Requirements 2.4, 3.6**
   *
   * For ANY request to /api/stats or /api/logs (with valid auth), the response
   * is always a valid JSON object (not HTML, not redirect).
   */
  describe('Property 11: REST API only returns JSON-serializable objects', () => {
    it('healthCheck always returns an object with status and uptime fields', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 999999999 }), (startTime) => {
          store.stats.serverStartTime = Date.now() - startTime;
          const result = controller.healthCheck();

          expect(result).toBeDefined();
          expect(typeof result).toBe('object');
          expect(result.status).toBe('ok');
          expect(typeof result.uptime).toBe('number');
          expect(result.uptime).toBeGreaterThanOrEqual(0);
          // Verify JSON serializable
          expect(() => JSON.stringify(result)).not.toThrow();
        }),
        { numRuns: 100 },
      );
    });

    it('getStats always returns a JSON-serializable DashboardStats object', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 0, max: 10000 }),
          (totalMessages, totalConnections, totalBroadcasts) => {
            store.stats.totalMessages = totalMessages;
            store.stats.totalConnections = totalConnections;
            store.stats.totalBroadcasts = totalBroadcasts;

            const result = controller.getStats();

            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
            expect(typeof result.onlineUsers).toBe('number');
            expect(typeof result.activeGroups).toBe('number');
            expect(typeof result.totalMessages).toBe('number');
            expect(Array.isArray(result.users)).toBe(true);
            expect(Array.isArray(result.groups)).toBe(true);
            // Verify JSON serializable
            expect(() => JSON.stringify(result)).not.toThrow();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('getLogs always returns a JSON-serializable object with logs array', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              action: fc.string({ minLength: 1, maxLength: 20 }),
              details: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 0, maxLength: 50 },
          ),
          (logEntries) => {
            // Add logs to store
            store.activityLogs.length = 0;
            for (const entry of logEntries) {
              store.addLog(entry.action, entry.details);
            }

            const result = controller.getLogs();

            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
            expect(Array.isArray(result.logs)).toBe(true);
            // Verify JSON serializable
            expect(() => JSON.stringify(result)).not.toThrow();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 12: Health check endpoint luôn accessible**
   * **Validates: Requirements 1.6**
   *
   * For ANY state of the ChatStore (random stats values, random users/groups),
   * the health check endpoint (GET /) always returns {status: "ok", uptime: <number>}
   * with both fields present.
   */
  describe('Property 12: Health check endpoint always accessible and returns complete response', () => {
    it('always returns {status: "ok", uptime: <number>} regardless of store state', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 20 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 10 }),
          (numConnections, usernames, groupNames) => {
            // Setup random store state
            store.users.clear();
            store.userToSocket.clear();
            store.groups.clear();
            store.stats.totalConnections = numConnections;

            for (const user of usernames) {
              store.users.set(`socket-${user}`, user);
              store.userToSocket.set(user, `socket-${user}`);
            }
            for (const group of groupNames) {
              store.groups.set(group, { creator: 'test', members: new Set(['test']) });
            }

            const result = controller.healthCheck();

            // Must always have both fields
            expect(result).toHaveProperty('status', 'ok');
            expect(result).toHaveProperty('uptime');
            expect(typeof result.uptime).toBe('number');
            expect(result.uptime).toBeGreaterThanOrEqual(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
