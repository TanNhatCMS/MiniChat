// Feature: dashboard-server-status, Property 3: Status level thresholds are exhaustive and non-overlapping
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getStatusLevel } from '../lib/server-status.utils';

/**
 * Property-Based Tests for client-side getStatusLevel utility.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 *
 * Property 3: Status level thresholds are exhaustive and non-overlapping
 * For any numeric usagePercent in [0, 100], getStatusLevel returns exactly one of:
 *   'normal' (when ≤ 80), 'warning' (when > 80 and ≤ 95), 'critical' (when > 95)
 */
describe('Property 3 (client mirror): Status level thresholds', () => {
  it('returns "normal" for any usagePercent in [0, 80]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 80, noNaN: true }),
        (usagePercent) => {
          expect(getStatusLevel(usagePercent)).toBe('normal');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "warning" for any usagePercent in (80, 95]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 80 + Number.EPSILON, max: 95, noNaN: true }).filter((v) => v > 80),
        (usagePercent) => {
          expect(getStatusLevel(usagePercent)).toBe('warning');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "critical" for any usagePercent in (95, 100]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 95 + Number.EPSILON, max: 100, noNaN: true }).filter((v) => v > 95),
        (usagePercent) => {
          expect(getStatusLevel(usagePercent)).toBe('critical');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always returns exactly one valid StatusLevel for any value in [0, 100]', () => {
    const validLevels = ['normal', 'warning', 'critical'];

    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        (usagePercent) => {
          const result = getStatusLevel(usagePercent);
          expect(validLevels).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('threshold boundaries are correct (80 → normal, 80.01 → warning, 95 → warning, 95.01 → critical)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        (usagePercent) => {
          const result = getStatusLevel(usagePercent);
          if (usagePercent <= 80) {
            expect(result).toBe('normal');
          } else if (usagePercent <= 95) {
            expect(result).toBe('warning');
          } else {
            expect(result).toBe('critical');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
