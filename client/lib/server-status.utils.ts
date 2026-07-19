/**
 * Client-side utility functions for the Server Status panel.
 */

import type { StatusLevel, UptimeBreakdown } from './types';

// Re-export types for backward compatibility
export type { StatusLevel, UptimeBreakdown, ServerStatus } from './types';

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Format an UptimeBreakdown into a human-readable string "Xd Yh Zm Ws".
 */
export function formatUptimeBreakdown(uptime: UptimeBreakdown): string {
  return `${uptime.days}d ${uptime.hours}h ${uptime.minutes}m ${uptime.seconds}s`;
}

/**
 * Map a StatusLevel to a display color.
 */
export function getStatusColor(level: StatusLevel): string {
  switch (level) {
    case 'normal':
      return '#4caf50';
    case 'warning':
      return '#ff9800';
    case 'critical':
      return '#f44336';
  }
}

/**
 * Determine the status level from a usage percentage.
 * Mirrors the server-side logic:
 *   normal  → usagePercent ≤ 80
 *   warning → usagePercent > 80 and ≤ 95
 *   critical → usagePercent > 95
 */
export function getStatusLevel(usagePercent: number): StatusLevel {
  if (usagePercent > 95) return 'critical';
  if (usagePercent > 80) return 'warning';
  return 'normal';
}
