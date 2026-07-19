import type { StatusLevel, UptimeBreakdown } from './types';

// Re-export types for backward compatibility
export type { UptimeBreakdown, ServerStatus, StatusLevel } from './types';

/** Convert bytes to megabytes, rounded to 1 decimal */
export function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

/** Convert total seconds to day/hour/minute/second breakdown */
export function secondsToBreakdown(totalSeconds: number): UptimeBreakdown {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds };
}

/** Determine status level based on usage percent */
export function getStatusLevel(usagePercent: number): StatusLevel {
  if (usagePercent > 95) return 'critical';
  if (usagePercent > 80) return 'warning';
  return 'normal';
}
