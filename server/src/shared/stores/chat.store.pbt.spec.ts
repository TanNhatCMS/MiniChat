import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ChatStore } from './chat.store';

/**
 * **Validates: Requirements 9.6**
 */
describe('ChatStore - Property Tests', () => {
  let store: ChatStore;

  beforeEach(() => {
    store = new ChatStore();
  });

  describe('Property 9: Activity log cap at 100 entries', () => {
    it('activityLogs never exceeds 100 entries regardless of how many logs are added', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }),
          (numLogs) => {
            store = new ChatStore(); // fresh store each run
            for (let i = 0; i < numLogs; i++) {
              store.addLog(`action-${i}`, `details-${i}`);
            }
            expect(store.activityLogs.length).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('newest log is always at index 0 (FIFO order)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              action: fc.string({ minLength: 1, maxLength: 20 }),
              details: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 1, maxLength: 150 },
          ),
          (logs) => {
            store = new ChatStore();
            let lastLog;
            for (const log of logs) {
              lastLog = store.addLog(log.action, log.details);
            }
            expect(store.activityLogs[0]).toBe(lastLog);
            expect(store.activityLogs.length).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
