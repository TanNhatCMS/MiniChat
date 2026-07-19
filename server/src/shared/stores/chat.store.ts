import { Injectable } from '@nestjs/common';
import type { GroupData, Stats, ActivityLog, DashboardStats } from '../types';

// Re-export types for backward compatibility
export type { GroupData, Stats, ActivityLog, DashboardStats } from '../types';

@Injectable()
export class ChatStore {
  // socketId → username
  readonly users = new Map<string, string>();
  // username → socketId
  readonly userToSocket = new Map<string, string>();
  // group name → GroupData
  readonly groups = new Map<string, GroupData>();
  // dashboard subscriber socket IDs
  readonly dashboardClients = new Set<string>();
  // Activity logs (max 100, newest first)
  readonly activityLogs: ActivityLog[] = [];

  readonly stats: Stats = {
    totalConnections: 0,
    totalMessages: 0,
    totalGroupMessages: 0,
    totalPrivateMessages: 0,
    totalBroadcasts: 0,
    serverStartTime: Date.now(),
  };

  addLog(action: string, details: string): ActivityLog {
    const log: ActivityLog = {
      timestamp: new Date().toISOString(),
      action,
      details,
    };
    this.activityLogs.unshift(log);
    if (this.activityLogs.length > 100) {
      this.activityLogs.pop();
    }
    return log;
  }

  getDashboardStats(): DashboardStats {
    return {
      onlineUsers: this.userToSocket.size,
      activeGroups: this.groups.size,
      totalMessages: this.stats.totalMessages,
      totalGroupMessages: this.stats.totalGroupMessages,
      totalPrivateMessages: this.stats.totalPrivateMessages,
      totalBroadcasts: this.stats.totalBroadcasts,
      totalConnections: this.stats.totalConnections,
      uptime: Math.floor((Date.now() - this.stats.serverStartTime) / 1000),
      users: Array.from(this.userToSocket.keys()),
      groups: Array.from(this.groups.entries()).map(([name, data]) => ({
        name,
        creator: data.creator,
        memberCount: data.members.size,
        members: Array.from(data.members),
      })),
    };
  }

  getAllGroupNames(): string[] {
    return Array.from(this.groups.keys());
  }

  getUserGroups(username: string): string[] {
    const result: string[] = [];
    this.groups.forEach((data, name) => {
      if (data.members.has(username)) result.push(name);
    });
    return result;
  }

  getGroupMembers(username: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    this.groups.forEach((data, name) => {
      if (data.members.has(username)) {
        result[name] = Array.from(data.members);
      }
    });
    return result;
  }
}
