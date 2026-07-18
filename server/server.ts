import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const PORT: number = parseInt(process.env.PORT || '3001', 10);

// Interfaces
interface GroupData {
  creator: string;
  members: Set<string>;
}

interface Stats {
  totalConnections: number;
  totalMessages: number;
  totalGroupMessages: number;
  totalPrivateMessages: number;
  totalBroadcasts: number;
  serverStartTime: number;
}

interface ActivityLog {
  timestamp: string;
  action: string;
  details: string;
}

interface IncomingMessage {
  type: string;
  payload?: Record<string, unknown>;
}

interface DashboardStats {
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

// Data stores
const users: Map<string, WebSocket> = new Map(); // username -> ws
const wsToUser: Map<WebSocket, string> = new Map(); // ws -> username
const groups: Map<string, GroupData> = new Map(); // name -> { creator, members: Set }
const dashboardClients: Set<WebSocket> = new Set();

// Stats tracking
const stats: Stats = {
  totalConnections: 0,
  totalMessages: 0,
  totalGroupMessages: 0,
  totalPrivateMessages: 0,
  totalBroadcasts: 0,
  serverStartTime: Date.now(),
};

// Activity logs (max 100)
const activityLogs: ActivityLog[] = [];

function addLog(action: string, details: string): void {
  const log: ActivityLog = {
    timestamp: new Date().toISOString(),
    action,
    details,
  };
  activityLogs.unshift(log);
  if (activityLogs.length > 100) {
    activityLogs.pop();
  }
  broadcastToDashboard({ type: 'new-log', payload: log });
}

// Helper functions
function sendToWs(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastToUsers(type: string, payload: unknown, excludeWs: WebSocket | null = null): void {
  users.forEach((ws: WebSocket) => {
    if (ws !== excludeWs) {
      sendToWs(ws, type, payload);
    }
  });
}

function sendToGroup(groupName: string, type: string, payload: unknown, excludeWs: WebSocket | null = null): void {
  const group = groups.get(groupName);
  if (!group) return;
  group.members.forEach((memberName: string) => {
    const memberWs = users.get(memberName);
    if (memberWs && memberWs !== excludeWs) {
      sendToWs(memberWs, type, payload);
    }
  });
}

function broadcastToDashboard(message: { type: string; payload: unknown }): void {
  dashboardClients.forEach((ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function getDashboardStats(): DashboardStats {
  return {
    onlineUsers: users.size,
    activeGroups: groups.size,
    totalMessages: stats.totalMessages,
    totalGroupMessages: stats.totalGroupMessages,
    totalPrivateMessages: stats.totalPrivateMessages,
    totalBroadcasts: stats.totalBroadcasts,
    totalConnections: stats.totalConnections,
    uptime: Math.floor((Date.now() - stats.serverStartTime) / 1000),
    users: Array.from(users.keys()),
    groups: Array.from(groups.entries()).map(([name, data]) => ({
      name,
      creator: data.creator,
      memberCount: data.members.size,
      members: Array.from(data.members),
    })),
  };
}

function getAllGroupNames(): string[] {
  return Array.from(groups.keys());
}

function getUserGroups(username: string): string[] {
  const userGroups: string[] = [];
  groups.forEach((data: GroupData, name: string) => {
    if (data.members.has(username)) {
      userGroups.push(name);
    }
  });
  return userGroups;
}

// HTTP server for dashboard
// NOTE: Dashboard endpoints are intentionally open (no auth) for development/learning purposes.
const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
  if (req.url === '/' || req.url === '/dashboard') {
    const dashboardPath = path.join(__dirname, 'dashboard.html');
    fs.readFile(dashboardPath, 'utf8', (err: NodeJS.ErrnoException | null, data: string) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading dashboard');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDashboardStats()));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  stats.totalConnections++;
  addLog('connection', 'New WebSocket connection established');

  ws.on('message', (data: Buffer) => {
    let message: IncomingMessage;
    try {
      message = JSON.parse(data.toString());
    } catch (e) {
      sendToWs(ws, 'error', { message: 'Invalid message format' });
      return;
    }

    // Validate message schema
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      sendToWs(ws, 'error', { message: 'Invalid message schema: must have a string "type" field' });
      return;
    }

    const { type, payload: rawPayload } = message;
    const payload: Record<string, unknown> = rawPayload || {};

    switch (type) {
      case 'register': {
        // Prevent re-registration on already registered socket
        if (wsToUser.has(ws)) {
          sendToWs(ws, 'register-response', { success: false, message: 'Already registered on this connection' });
          return;
        }
        const username = payload.username as string | undefined;
        if (!username || username.trim().length === 0) {
          sendToWs(ws, 'register-response', { success: false, message: 'Username is required' });
          return;
        }
        const trimmedUsername = username.trim();
        if (users.has(trimmedUsername)) {
          sendToWs(ws, 'register-response', { success: false, message: 'Username already taken' });
          return;
        }
        if (trimmedUsername.length > 20) {
          sendToWs(ws, 'register-response', { success: false, message: 'Username too long (max 20 chars)' });
          return;
        }

        users.set(trimmedUsername, ws);
        wsToUser.set(ws, trimmedUsername);

        // Send successful registration response
        sendToWs(ws, 'register-response', {
          success: true,
          username: trimmedUsername,
          users: Array.from(users.keys()).filter((u: string) => u !== trimmedUsername),
          groups: getAllGroupNames(),
          myGroups: getUserGroups(trimmedUsername),
        });

        // Broadcast to others that user joined
        broadcastToUsers('user-joined', { username: trimmedUsername }, ws);

        addLog('register', `User "${trimmedUsername}" registered`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'create-group': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const name = payload.name as string | undefined;
        if (!name || name.trim().length === 0) {
          sendToWs(ws, 'error', { message: 'Group name is required' });
          return;
        }
        const groupName = name.trim();
        if (groups.has(groupName)) {
          sendToWs(ws, 'error', { message: 'Group already exists' });
          return;
        }

        groups.set(groupName, { creator: username, members: new Set([username]) });

        // Send specific myGroups to each user
        users.forEach((userWs: WebSocket, userName: string) => {
          sendToWs(userWs, 'groups-updated', {
            groups: getAllGroupNames(),
            myGroups: getUserGroups(userName),
          });
        });

        addLog('create-group', `User "${username}" created group "${groupName}"`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'join-group': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const name = payload.name as string;
        const group = groups.get(name);
        if (!group) {
          sendToWs(ws, 'error', { message: 'Group not found' });
          return;
        }
        if (group.members.has(username)) {
          sendToWs(ws, 'error', { message: 'Already a member of this group' });
          return;
        }

        group.members.add(username);

        // Notify group members
        sendToGroup(name, 'group-member-joined', { group: name, username });

        // Broadcast updated groups to all users
        users.forEach((userWs: WebSocket, userName: string) => {
          sendToWs(userWs, 'groups-updated', {
            groups: getAllGroupNames(),
            myGroups: getUserGroups(userName),
          });
        });

        addLog('join-group', `User "${username}" joined group "${name}"`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'leave-group': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const name = payload.name as string;
        const group = groups.get(name);
        if (!group) {
          sendToWs(ws, 'error', { message: 'Group not found' });
          return;
        }

        group.members.delete(username);

        // Notify remaining group members
        sendToGroup(name, 'group-member-left', { group: name, username });

        // Delete empty groups
        if (group.members.size === 0) {
          groups.delete(name);
        }

        // Broadcast updated groups to all users
        users.forEach((userWs: WebSocket, userName: string) => {
          sendToWs(userWs, 'groups-updated', {
            groups: getAllGroupNames(),
            myGroups: getUserGroups(userName),
          });
        });

        addLog('leave-group', `User "${username}" left group "${name}"`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'group-message': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const groupName = payload.group as string;
        const msgText = payload.message as string;
        const group = groups.get(groupName);
        if (!group) {
          sendToWs(ws, 'error', { message: 'Group not found' });
          return;
        }
        if (!group.members.has(username)) {
          sendToWs(ws, 'error', { message: 'Not a member of this group' });
          return;
        }

        stats.totalMessages++;
        stats.totalGroupMessages++;

        sendToGroup(groupName, 'receive-message', {
          sender: username,
          message: msgText,
          type: 'group',
          group: groupName,
        }, ws);

        addLog('group-message', `${username} -> group "${groupName}"`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'private-message': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const target = payload.target as string;
        const msgText = payload.message as string;
        const targetWs = users.get(target);
        if (!targetWs) {
          sendToWs(ws, 'error', { message: 'User not found or offline' });
          return;
        }

        stats.totalMessages++;
        stats.totalPrivateMessages++;

        sendToWs(targetWs, 'receive-message', {
          sender: username,
          message: msgText,
          type: 'private',
          target,
        });

        addLog('private-message', `${username} -> ${target}`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'broadcast-message': {
        const username = wsToUser.get(ws);
        if (!username) return;
        const msgText = payload.message as string;

        stats.totalMessages++;
        stats.totalBroadcasts++;

        broadcastToUsers('receive-message', {
          sender: username,
          message: msgText,
          type: 'broadcast',
        }, ws);

        addLog('broadcast', `${username} sent a broadcast message`);
        broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
        break;
      }

      case 'subscribe-dashboard': {
        dashboardClients.add(ws);
        sendToWs(ws, 'stats-update', getDashboardStats());
        sendToWs(ws, 'logs-history', { logs: activityLogs });
        break;
      }

      case 'get-users': {
        const username = wsToUser.get(ws);
        sendToWs(ws, 'users-list', {
          users: Array.from(users.keys()).filter((u: string) => u !== username),
        });
        break;
      }

      case 'get-groups': {
        sendToWs(ws, 'groups-list', { groups: getAllGroupNames() });
        break;
      }

      case 'get-my-groups': {
        const username = wsToUser.get(ws);
        if (!username) return;
        sendToWs(ws, 'my-groups-list', { groups: getUserGroups(username) });
        break;
      }

      default:
        sendToWs(ws, 'error', { message: `Unknown message type: ${type}` });
    }
  });

  ws.on('close', () => {
    const username = wsToUser.get(ws);
    if (username) {
      // Remove from all groups
      groups.forEach((group: GroupData, groupName: string) => {
        if (group.members.has(username)) {
          group.members.delete(username);
          sendToGroup(groupName, 'group-member-left', { group: groupName, username });
          if (group.members.size === 0) {
            groups.delete(groupName);
          }
        }
      });

      // Remove from users
      users.delete(username);
      wsToUser.delete(ws);

      // Broadcast user left
      broadcastToUsers('user-left', { username });

      // Update groups for remaining users
      users.forEach((userWs: WebSocket, userName: string) => {
        sendToWs(userWs, 'groups-updated', {
          groups: getAllGroupNames(),
          myGroups: getUserGroups(userName),
        });
      });

      addLog('disconnect', `User "${username}" disconnected`);
      broadcastToDashboard({ type: 'stats-update', payload: getDashboardStats() });
    }

    // Remove from dashboard clients
    dashboardClients.delete(ws);
  });

  ws.on('error', (err: Error) => {
    console.error('[MiniChat Server] WebSocket error:', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`[MiniChat Server] Running on port ${PORT}`);
  console.log(`[MiniChat Server] Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`[MiniChat Server] API Stats: http://localhost:${PORT}/api/stats`);
});
