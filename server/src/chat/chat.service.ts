import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatStore } from '../shared/stores/chat.store';
import { ServerMonitorService } from '../shared/server-monitor.service';

@Injectable()
export class ChatService {
  private server!: Server;

  constructor(
    private readonly store: ChatStore,
    private readonly serverMonitor: ServerMonitorService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
    this.serverMonitor.setServer(server);
  }

  handleConnection(client: Socket): void {
    this.store.stats.totalConnections++;
    this.store.addLog('connection', 'New Socket.IO connection established');
  }

  handleDisconnect(client: Socket): void {
    const username = this.store.users.get(client.id);
    if (username) {
      this.cleanupUser(client, username);
    }
    this.store.dashboardClients.delete(client.id);
  }

  register(client: Socket, payload: { username?: string }): void {
    const username = payload.username;
    if (!username || username.trim().length === 0) {
      client.emit('register-response', {
        success: false,
        message: 'Username is required',
      });
      return;
    }
    const trimmed = username.trim();

    // Already registered on this socket
    const existing = this.store.users.get(client.id);
    if (existing) {
      if (existing === trimmed) {
        // Idempotent re-register
        client.emit('register-response', {
          success: true,
          username: trimmed,
          users: Array.from(this.store.userToSocket.keys()).filter(
            (u) => u !== trimmed,
          ),
          groups: this.store.getAllGroupNames(),
          myGroups: this.store.getUserGroups(trimmed),
          groupMembers: this.store.getGroupMembers(trimmed),
        });
      } else {
        client.emit('register-response', {
          success: false,
          message: 'Cannot change username on this connection',
        });
      }
      return;
    }

    if (this.store.userToSocket.has(trimmed)) {
      client.emit('register-response', {
        success: false,
        message: 'Username already taken',
      });
      return;
    }
    if (trimmed.length > 20) {
      client.emit('register-response', {
        success: false,
        message: 'Username too long (max 20 chars)',
      });
      return;
    }

    // Register user
    this.store.users.set(client.id, trimmed);
    this.store.userToSocket.set(trimmed, client.id);

    client.emit('register-response', {
      success: true,
      username: trimmed,
      users: Array.from(this.store.userToSocket.keys()).filter(
        (u) => u !== trimmed,
      ),
      groups: this.store.getAllGroupNames(),
      myGroups: this.store.getUserGroups(trimmed),
      groupMembers: this.store.getGroupMembers(trimmed),
    });

    // Broadcast to others
    client.broadcast.emit('user-joined', { username: trimmed });

    this.store.addLog('register', `User "${trimmed}" registered`);
    this.broadcastDashboardStats();
  }

  broadcastMessage(client: Socket, payload: { message?: string }): void {
    const username = this.store.users.get(client.id);
    if (!username) return; // Silent ignore unregistered

    this.store.stats.totalMessages++;
    this.store.stats.totalBroadcasts++;

    client.broadcast.emit('receive-message', {
      sender: username,
      message: payload.message,
      type: 'broadcast',
    });

    this.store.addLog('broadcast', `${username} sent a broadcast message`);
    this.broadcastDashboardStats();
  }

  privateMessage(
    client: Socket,
    payload: { target?: string; message?: string },
  ): void {
    const username = this.store.users.get(client.id);
    if (!username) return;

    const targetSocketId = this.store.userToSocket.get(payload.target || '');
    if (!targetSocketId) {
      client.emit('error', { message: 'User not found or offline' });
      return;
    }

    this.store.stats.totalMessages++;
    this.store.stats.totalPrivateMessages++;

    this.server.to(targetSocketId).emit('receive-message', {
      sender: username,
      message: payload.message,
      type: 'private',
      target: payload.target,
    });

    this.store.addLog('private-message', `${username} -> ${payload.target}`);
    this.broadcastDashboardStats();
  }

  groupMessage(
    client: Socket,
    payload: { group?: string; message?: string },
  ): void {
    const username = this.store.users.get(client.id);
    if (!username) return;

    const group = this.store.groups.get(payload.group || '');
    if (!group) {
      client.emit('error', { message: 'Group not found' });
      return;
    }
    if (!group.members.has(username)) {
      client.emit('error', { message: 'Not a member of this group' });
      return;
    }

    this.store.stats.totalMessages++;
    this.store.stats.totalGroupMessages++;

    // Emit to room excluding sender
    client.to(`group:${payload.group}`).emit('receive-message', {
      sender: username,
      message: payload.message,
      type: 'group',
      group: payload.group,
    });

    this.store.addLog(
      'group-message',
      `${username} -> group "${payload.group}"`,
    );
    this.broadcastDashboardStats();
  }

  createGroup(client: Socket, payload: { name?: string }): void {
    const username = this.store.users.get(client.id);
    if (!username) return;

    const name = payload.name?.trim();
    if (!name) {
      client.emit('error', { message: 'Group name is required' });
      return;
    }
    if (this.store.groups.has(name)) {
      client.emit('error', { message: 'Group already exists' });
      return;
    }

    this.store.groups.set(name, {
      creator: username,
      members: new Set([username]),
    });
    client.join(`group:${name}`);

    this.broadcastGroupsUpdated();
    this.store.addLog(
      'create-group',
      `User "${username}" created group "${name}"`,
    );
    this.broadcastDashboardStats();
  }

  joinGroup(client: Socket, payload: { name?: string }): void {
    const username = this.store.users.get(client.id);
    if (!username) return;

    const group = this.store.groups.get(payload.name || '');
    if (!group) {
      client.emit('error', { message: 'Group not found' });
      return;
    }
    if (group.members.has(username)) {
      client.emit('error', { message: 'Already a member of this group' });
      return;
    }

    group.members.add(username);
    client.join(`group:${payload.name}`);

    // Notify group members
    this.server.to(`group:${payload.name}`).emit('group-member-joined', {
      group: payload.name,
      username,
    });

    this.broadcastGroupsUpdated();
    this.store.addLog(
      'join-group',
      `User "${username}" joined group "${payload.name}"`,
    );
    this.broadcastDashboardStats();
  }

  leaveGroup(client: Socket, payload: { name?: string }): void {
    const username = this.store.users.get(client.id);
    if (!username) return;

    const group = this.store.groups.get(payload.name || '');
    if (!group) {
      client.emit('error', { message: 'Group not found' });
      return;
    }

    group.members.delete(username);
    client.leave(`group:${payload.name}`);

    // Notify remaining members
    this.server.to(`group:${payload.name}`).emit('group-member-left', {
      group: payload.name,
      username,
    });

    // Delete empty groups
    if (group.members.size === 0) {
      this.store.groups.delete(payload.name!);
    }

    this.broadcastGroupsUpdated();
    this.store.addLog(
      'leave-group',
      `User "${username}" left group "${payload.name}"`,
    );
    this.broadcastDashboardStats();
  }

  getUsers(client: Socket): void {
    const username = this.store.users.get(client.id);
    client.emit('users-list', {
      users: Array.from(this.store.userToSocket.keys()).filter(
        (u) => u !== username,
      ),
    });
  }

  getGroups(client: Socket): void {
    client.emit('groups-list', { groups: this.store.getAllGroupNames() });
  }

  getMyGroups(client: Socket): void {
    const username = this.store.users.get(client.id);
    if (!username) return;
    client.emit('my-groups-list', {
      groups: this.store.getUserGroups(username),
    });
  }

  subscribeDashboard(client: Socket, payload: { password?: string }): void {
    const dashPassword = process.env.DASHBOARD_PASSWORD || '';
    if (dashPassword && payload.password !== dashPassword) {
      client.emit('error', {
        message: 'Unauthorized: incorrect dashboard password',
      });
      return;
    }

    this.store.dashboardClients.add(client.id);
    client.join('dashboard');
    client.emit('stats-update', this.store.getDashboardStats());
    client.emit('logs-history', { logs: this.store.activityLogs });
    this.serverMonitor.emitStatusNow();
  }

  // --- Helper methods ---

  private cleanupUser(client: Socket, username: string): void {
    // Remove from all groups
    this.store.groups.forEach((group, groupName) => {
      if (group.members.has(username)) {
        group.members.delete(username);
        client
          .to(`group:${groupName}`)
          .emit('group-member-left', { group: groupName, username });
        if (group.members.size === 0) {
          this.store.groups.delete(groupName);
        }
      }
    });

    this.store.users.delete(client.id);
    this.store.userToSocket.delete(username);

    // Broadcast user left
    this.server.emit('user-left', { username });

    this.broadcastGroupsUpdated();
    this.store.addLog('disconnect', `User "${username}" disconnected`);
    this.broadcastDashboardStats();
  }

  private broadcastGroupsUpdated(): void {
    // Send personalized groups-updated to each connected user
    for (const [socketId, uname] of this.store.users.entries()) {
      this.server.to(socketId).emit('groups-updated', {
        groups: this.store.getAllGroupNames(),
        myGroups: this.store.getUserGroups(uname),
        groupMembers: this.store.getGroupMembers(uname),
      });
    }
  }

  private broadcastDashboardStats(): void {
    const stats = this.store.getDashboardStats();
    this.server.to('dashboard').emit('stats-update', stats);
  }
}
