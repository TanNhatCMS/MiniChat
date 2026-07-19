// ─── Server Monitor Types ─────────────────────────────────────────────────────

export type StatusLevel = 'normal' | 'warning' | 'critical';

export interface UptimeBreakdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export interface ServerStatus {
  cpu: {
    usagePercent: number;
  };
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    heapUsagePercent: number;
    systemTotalMB: number;
    systemFreeMB: number;
    systemUsedMB: number;
    systemUsagePercent: number;
  };
  uptime: UptimeBreakdown;
  runtime: {
    nodeVersion: string;
    platform: string;
  };
  timestamp: string;
}

// ─── Chat Store Types ─────────────────────────────────────────────────────────

export interface GroupData {
  creator: string;
  members: Set<string>;
}

export interface Stats {
  totalConnections: number;
  totalMessages: number;
  totalGroupMessages: number;
  totalPrivateMessages: number;
  totalBroadcasts: number;
  serverStartTime: number;
}

export interface ActivityLog {
  timestamp: string;
  action: string;
  details: string;
}

export interface DashboardStats {
  onlineUsers: number;
  activeGroups: number;
  totalMessages: number;
  totalGroupMessages: number;
  totalPrivateMessages: number;
  totalBroadcasts: number;
  totalConnections: number;
  uptime: number;
  users: string[];
  groups: Array<{
    name: string;
    creator: string;
    memberCount: number;
    members: string[];
  }>;
}
