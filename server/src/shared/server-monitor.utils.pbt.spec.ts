import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { bytesToMB, secondsToBreakdown, getStatusLevel } from './server-monitor.utils';

/**
 * **Validates: Requirements 1.2, 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5**
 */
describe('server-monitor.utils - Property Tests', () => {
  // Feature: dashboard-server-status, Property 1: Bytes-to-MB conversion preserves proportionality
  describe('Property 1: Bytes-to-MB conversion preserves proportionality', () => {
    it('bytesToMB(bytes) equals Math.round(bytes / (1024 * 1024) * 10) / 10 and result is non-negative', () => {
      fc.assert(
        fc.property(fc.nat(), (bytes) => {
          const result = bytesToMB(bytes);
          const expected = Math.round((bytes / (1024 * 1024)) * 10) / 10;
          expect(result).toBe(expected);
          expect(result).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: dashboard-server-status, Property 2: Uptime breakdown round-trip
  describe('Property 2: Uptime breakdown round-trip', () => {
    it('days * 86400 + hours * 3600 + minutes * 60 + seconds === totalSeconds with correct ranges', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10_000_000 }), (totalSeconds) => {
          const breakdown = secondsToBreakdown(totalSeconds);

          // Round-trip: components must reconstruct the original totalSeconds
          const reconstructed =
            breakdown.days * 86400 +
            breakdown.hours * 3600 +
            breakdown.minutes * 60 +
            breakdown.seconds;
          expect(reconstructed).toBe(totalSeconds);

          // Range constraints
          expect(breakdown.hours).toBeGreaterThanOrEqual(0);
          expect(breakdown.hours).toBeLessThanOrEqual(23);
          expect(breakdown.minutes).toBeGreaterThanOrEqual(0);
          expect(breakdown.minutes).toBeLessThanOrEqual(59);
          expect(breakdown.seconds).toBeGreaterThanOrEqual(0);
          expect(breakdown.seconds).toBeLessThanOrEqual(59);

          // totalSeconds field matches input
          expect(breakdown.totalSeconds).toBe(totalSeconds);
        }),
        { numRuns: 100 },
      );
    });
  });

  // Feature: dashboard-server-status, Property 3: Status level thresholds are exhaustive and non-overlapping
  describe('Property 3: Status level thresholds are exhaustive and non-overlapping', () => {
    it('exactly one of normal, warning, or critical is returned for any percent in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          (usagePercent) => {
            const level = getStatusLevel(usagePercent);

            // Exactly one valid level is returned
            expect(['normal', 'warning', 'critical']).toContain(level);

            // Verify correct threshold assignment
            if (usagePercent > 95) {
              expect(level).toBe('critical');
            } else if (usagePercent > 80) {
              expect(level).toBe('warning');
            } else {
              expect(level).toBe('normal');
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
