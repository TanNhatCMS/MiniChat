export type MessageHandler = (payload: any) => void

// ─── Server Status Types ──────────────────────────────────────────────────────

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

// ─── Dashboard Types ──────────────────────────────────────────────────────────

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

export interface ActivityLog {
  timestamp: string;
  action: string;
  details: string;
}

export interface ServerStatusPanelProps {
  status: ServerStatus | null;
}

// ─── Chat Types ───────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  sender?: string;
  text: string;
  type: string;
  group?: string | null;
  target?: string | null;
  time: string;
  isSent?: boolean;
}

export interface ActiveChat {
  type: string;
  name: string;
}
