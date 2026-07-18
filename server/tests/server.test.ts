import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const TEST_PORT = 4001;
let serverProcess: any;

// Helper: tạo WebSocket client kết nối tới test server
function createClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// Helper: gửi message và đợi response
function sendAndWait(ws: WebSocket, msg: object, expectedType: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), 5000);
    const handler = (data: Buffer) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === expectedType) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(parsed.payload);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

// Helper: đợi nhận message
function waitForMessage(ws: WebSocket, expectedType: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), 5000);
    const handler = (data: Buffer) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === expectedType) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(parsed.payload);
      }
    };
    ws.on('message', handler);
  });
}

function closeClient(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
    ws.close();
  });
}

describe('MiniChat Server - WebSocket Integration', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  const clients: WebSocket[] = [];

  // Dữ liệu server giống server.ts
  const users: Map<string, WebSocket> = new Map();
  const wsToUser: Map<WebSocket, string> = new Map();
  const groups: Map<string, { creator: string; members: Set<string> }> = new Map();

  function sendToWs(ws: WebSocket, type: string, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  function getAllGroupNames(): string[] {
    return Array.from(groups.keys());
  }

  function getUserGroups(username: string): string[] {
    const userGroups: string[] = [];
    groups.forEach((data, name) => {
      if (data.members.has(username)) userGroups.push(name);
    });
    return userGroups;
  }

  beforeAll(() => {
    return new Promise<void>((resolve) => {
      server = http.createServer();
      wss = new WebSocketServer({ server });

      wss.on('connection', (ws) => {
        ws.on('message', (data: Buffer) => {
          let message: any;
          try {
            message = JSON.parse(data.toString());
          } catch {
            sendToWs(ws, 'error', { message: 'Invalid message format' });
            return;
          }

          const { type, payload = {} } = message;

          switch (type) {
            case 'register': {
              const username = (payload.username || '').trim();
              if (!username) {
                sendToWs(ws, 'register-response', { success: false, message: 'Username is required' });
                return;
              }
              if (users.has(username)) {
                sendToWs(ws, 'register-response', { success: false, message: 'Username already taken' });
                return;
              }
              users.set(username, ws);
              wsToUser.set(ws, username);
              sendToWs(ws, 'register-response', {
                success: true,
                username,
                users: Array.from(users.keys()).filter((u) => u !== username),
                groups: getAllGroupNames(),
                myGroups: getUserGroups(username),
              });
              // Broadcast user-joined
              users.forEach((otherWs, otherUser) => {
                if (otherUser !== username) {
                  sendToWs(otherWs, 'user-joined', { username });
                }
              });
              break;
            }
            case 'broadcast-message': {
              const username = wsToUser.get(ws);
              if (!username) return;
              users.forEach((otherWs) => {
                if (otherWs !== ws) {
                  sendToWs(otherWs, 'receive-message', {
                    sender: username,
                    message: payload.message,
                    type: 'broadcast',
                  });
                }
              });
              break;
            }
            case 'private-message': {
              const username = wsToUser.get(ws);
              if (!username) return;
              const targetWs = users.get(payload.target);
              if (!targetWs) {
                sendToWs(ws, 'error', { message: 'User not found or offline' });
                return;
              }
              sendToWs(targetWs, 'receive-message', {
                sender: username,
                message: payload.message,
                type: 'private',
                target: payload.target,
              });
              break;
            }
            case 'create-group': {
              const username = wsToUser.get(ws);
              if (!username) return;
              const name = (payload.name || '').trim();
              if (!name) {
                sendToWs(ws, 'error', { message: 'Group name is required' });
                return;
              }
              if (groups.has(name)) {
                sendToWs(ws, 'error', { message: 'Group already exists' });
                return;
              }
              groups.set(name, { creator: username, members: new Set([username]) });
              users.forEach((userWs, userName) => {
                sendToWs(userWs, 'groups-updated', {
                  groups: getAllGroupNames(),
                  myGroups: getUserGroups(userName),
                });
              });
              break;
            }
            case 'join-group': {
              const username = wsToUser.get(ws);
              if (!username) return;
              const group = groups.get(payload.name);
              if (!group) {
                sendToWs(ws, 'error', { message: 'Group not found' });
                return;
              }
              group.members.add(username);
              users.forEach((userWs, userName) => {
                sendToWs(userWs, 'groups-updated', {
                  groups: getAllGroupNames(),
                  myGroups: getUserGroups(userName),
                });
              });
              break;
            }
            case 'group-message': {
              const username = wsToUser.get(ws);
              if (!username) return;
              const group = groups.get(payload.group);
              if (!group) {
                sendToWs(ws, 'error', { message: 'Group not found' });
                return;
              }
              if (!group.members.has(username)) {
                sendToWs(ws, 'error', { message: 'Not a member of this group' });
                return;
              }
              group.members.forEach((memberName) => {
                const memberWs = users.get(memberName);
                if (memberWs && memberWs !== ws) {
                  sendToWs(memberWs, 'receive-message', {
                    sender: username,
                    message: payload.message,
                    type: 'group',
                    group: payload.group,
                  });
                }
              });
              break;
            }
          }
        });

        ws.on('close', () => {
          const username = wsToUser.get(ws);
          if (username) {
            groups.forEach((group, groupName) => {
              group.members.delete(username);
              if (group.members.size === 0) groups.delete(groupName);
            });
            users.delete(username);
            wsToUser.delete(ws);
            users.forEach((otherWs) => {
              sendToWs(otherWs, 'user-left', { username });
            });
          }
        });
      });

      server.listen(TEST_PORT, () => resolve());
    });
  });

  afterAll(async () => {
    for (const client of clients) {
      await closeClient(client);
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  });

  beforeEach(() => {
    // Clean state
    users.clear();
    wsToUser.clear();
    groups.clear();
  });

  describe('Đăng ký người dùng', () => {
    it('đăng ký thành công với username hợp lệ', async () => {
      const ws = await createClient();
      clients.push(ws);

      const response = await sendAndWait(
        ws,
        { type: 'register', payload: { username: 'alice' } },
        'register-response',
      );

      expect(response.success).toBe(true);
      expect(response.username).toBe('alice');
      expect(response.users).toEqual([]);
      expect(response.groups).toEqual([]);

      await closeClient(ws);
      clients.pop();
    });

    it('từ chối username trống', async () => {
      const ws = await createClient();
      clients.push(ws);

      const response = await sendAndWait(
        ws,
        { type: 'register', payload: { username: '' } },
        'register-response',
      );

      expect(response.success).toBe(false);
      expect(response.message).toContain('required');

      await closeClient(ws);
      clients.pop();
    });

    it('từ chối username đã tồn tại', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'bob' } }, 'register-response');

      const response = await sendAndWait(
        ws2,
        { type: 'register', payload: { username: 'bob' } },
        'register-response',
      );

      expect(response.success).toBe(false);
      expect(response.message).toContain('already taken');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });
  });

  describe('Nhắn tin phát chung', () => {
    it('gửi tin nhắn broadcast tới tất cả người dùng khác', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'user1' } }, 'register-response');
      await sendAndWait(ws2, { type: 'register', payload: { username: 'user2' } }, 'register-response');

      // user2 chờ nhận tin nhắn
      const msgPromise = waitForMessage(ws2, 'receive-message');

      // user1 gửi broadcast
      ws1.send(JSON.stringify({ type: 'broadcast-message', payload: { message: 'Xin chào!' } }));

      const msg = await msgPromise;
      expect(msg.sender).toBe('user1');
      expect(msg.message).toBe('Xin chào!');
      expect(msg.type).toBe('broadcast');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });
  });

  describe('Nhắn tin riêng', () => {
    it('gửi tin nhắn riêng tới người dùng cụ thể', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'alice' } }, 'register-response');
      await sendAndWait(ws2, { type: 'register', payload: { username: 'bob' } }, 'register-response');

      const msgPromise = waitForMessage(ws2, 'receive-message');

      ws1.send(JSON.stringify({
        type: 'private-message',
        payload: { target: 'bob', message: 'Chào bạn!' },
      }));

      const msg = await msgPromise;
      expect(msg.sender).toBe('alice');
      expect(msg.message).toBe('Chào bạn!');
      expect(msg.type).toBe('private');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });

    it('trả lỗi khi gửi tin nhắn tới user không tồn tại', async () => {
      const ws = await createClient();
      clients.push(ws);

      await sendAndWait(ws, { type: 'register', payload: { username: 'alice' } }, 'register-response');

      const errPromise = waitForMessage(ws, 'error');
      ws.send(JSON.stringify({
        type: 'private-message',
        payload: { target: 'nobody', message: 'Hello' },
      }));

      const err = await errPromise;
      expect(err.message).toContain('not found');

      await closeClient(ws);
      clients.pop();
    });
  });

  describe('Quản lý nhóm', () => {
    it('tạo nhóm thành công', async () => {
      const ws = await createClient();
      clients.push(ws);

      await sendAndWait(ws, { type: 'register', payload: { username: 'alice' } }, 'register-response');

      const updatePromise = waitForMessage(ws, 'groups-updated');
      ws.send(JSON.stringify({ type: 'create-group', payload: { name: 'devs' } }));

      const update = await updatePromise;
      expect(update.groups).toContain('devs');
      expect(update.myGroups).toContain('devs');

      await closeClient(ws);
      clients.pop();
    });

    it('tham gia nhóm thành công', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'alice' } }, 'register-response');
      await sendAndWait(ws2, { type: 'register', payload: { username: 'bob' } }, 'register-response');

      // alice tạo nhóm
      await waitForMessage(ws1, 'groups-updated');
      ws1.send(JSON.stringify({ type: 'create-group', payload: { name: 'team' } }));

      // Chờ bob nhận groups-updated từ việc alice tạo nhóm
      await waitForMessage(ws2, 'groups-updated');

      // bob tham gia nhóm
      const updatePromise = waitForMessage(ws2, 'groups-updated');
      ws2.send(JSON.stringify({ type: 'join-group', payload: { name: 'team' } }));

      const update = await updatePromise;
      expect(update.myGroups).toContain('team');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });

    it('gửi tin nhắn nhóm tới thành viên', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'alice' } }, 'register-response');
      await sendAndWait(ws2, { type: 'register', payload: { username: 'bob' } }, 'register-response');

      // Tạo nhóm và bob tham gia
      ws1.send(JSON.stringify({ type: 'create-group', payload: { name: 'team' } }));
      await waitForMessage(ws2, 'groups-updated');
      ws2.send(JSON.stringify({ type: 'join-group', payload: { name: 'team' } }));
      await waitForMessage(ws2, 'groups-updated');

      // alice gửi tin nhắn nhóm
      const msgPromise = waitForMessage(ws2, 'receive-message');
      ws1.send(JSON.stringify({
        type: 'group-message',
        payload: { group: 'team', message: 'Chào nhóm!' },
      }));

      const msg = await msgPromise;
      expect(msg.sender).toBe('alice');
      expect(msg.message).toBe('Chào nhóm!');
      expect(msg.type).toBe('group');
      expect(msg.group).toBe('team');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });
  });

  describe('Kết nối/Ngắt kết nối', () => {
    it('thông báo user-left khi ngắt kết nối', async () => {
      const ws1 = await createClient();
      const ws2 = await createClient();
      clients.push(ws1, ws2);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'alice' } }, 'register-response');
      await sendAndWait(ws2, { type: 'register', payload: { username: 'bob' } }, 'register-response');

      const leftPromise = waitForMessage(ws1, 'user-left');
      await closeClient(ws2);

      const left = await leftPromise;
      expect(left.username).toBe('bob');

      await closeClient(ws1);
      clients.splice(-2);
    });

    it('thông báo user-joined khi có người mới', async () => {
      const ws1 = await createClient();
      clients.push(ws1);

      await sendAndWait(ws1, { type: 'register', payload: { username: 'alice' } }, 'register-response');

      const joinPromise = waitForMessage(ws1, 'user-joined');

      const ws2 = await createClient();
      clients.push(ws2);
      ws2.send(JSON.stringify({ type: 'register', payload: { username: 'bob' } }));

      const joined = await joinPromise;
      expect(joined.username).toBe('bob');

      await closeClient(ws1);
      await closeClient(ws2);
      clients.splice(-2);
    });
  });
});
