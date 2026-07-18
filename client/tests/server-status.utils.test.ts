import { describe, it, expect } from 'vitest';
import {
  formatUptimeBreakdown,
  getStatusColor,
  getStatusLevel,
} from '../lib/server-status.utils';
import type { UptimeBreakdown } from '../lib/server-status.utils';

describe('server-status.utils', () => {
  describe('formatUptimeBreakdown', () => {
    it('formats zero uptime correctly', () => {
      const uptime: UptimeBreakdown = { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
      expect(formatUptimeBreakdown(uptime)).toBe('0d 0h 0m 0s');
    });

    it('formats a typical uptime correctly', () => {
      const uptime: UptimeBreakdown = { days: 2, hours: 5, minutes: 30, seconds: 45, totalSeconds: 192645 };
      expect(formatUptimeBreakdown(uptime)).toBe('2d 5h 30m 45s');
    });

    it('formats uptime with large days', () => {
      const uptime: UptimeBreakdown = { days: 365, hours: 23, minutes: 59, seconds: 59, totalSeconds: 31622399 };
      expect(formatUptimeBreakdown(uptime)).toBe('365d 23h 59m 59s');
    });
  });

  describe('getStatusColor', () => {
    it('returns green for normal', () => {
      expect(getStatusColor('normal')).toBe('#4caf50');
    });

    it('returns orange/yellow for warning', () => {
      expect(getStatusColor('warning')).toBe('#ff9800');
    });

    it('returns red for critical', () => {
      expect(getStatusColor('critical')).toBe('#f44336');
    });
  });

  describe('getStatusLevel', () => {
    it('returns normal for 0%', () => {
      expect(getStatusLevel(0)).toBe('normal');
    });

    it('returns normal for exactly 80%', () => {
      expect(getStatusLevel(80)).toBe('normal');
    });

    it('returns warning for 80.1%', () => {
      expect(getStatusLevel(80.1)).toBe('warning');
    });

    it('returns warning for exactly 95%', () => {
      expect(getStatusLevel(95)).toBe('warning');
    });

    it('returns critical for 95.1%', () => {
      expect(getStatusLevel(95.1)).toBe('critical');
    });

    it('returns critical for 100%', () => {
      expect(getStatusLevel(100)).toBe('critical');
    });
  });
});
