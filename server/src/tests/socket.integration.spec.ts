import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../app.module';

let app: INestApplication;
let port: number;

function createClient(): ClientSocket {
  return io(`http://localhost:${port}`, {
    autoConnect: false,
    transports: ['websocket'],
  });
}

function connectClient(client: ClientSocket): Promise<void> {
  return new Promise((resolve) => {
    if (client.connected) {
      resolve();
      return;
    }
    client.once('connect', () => resolve());
    client.connect();
  });
}

function waitForEvent(
  client: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for ${event}`)),
      timeout,
    );
    client.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function registerClient(
  client: ClientSocket,
  username: string,
): Promise<any> {
  const responsePromise = waitForEvent(client, 'register-response');
  client.emit('register', { username });
  return responsePromise;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.init();
  await app.listen(0);
  const url = await app.getUrl();
  port = parseInt(new URL(url).port);
});

afterAll(async () => {
  await app.close();
});

describe('Socket.IO Integration Tests', () => {
  let clients: ClientSocket[] = [];

  afterEach(() => {
    clients.forEach((c) => {
      if (c.connected) c.disconnect();
    });
    clients = [];
  });

  function tracked(client: ClientSocket): ClientSocket {
    clients.push(client);
    return client;
  }

  describe('Registration', () => {
    it('should register with valid username and receive success response', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const response = await registerClient(client, 'Alice');

      expect(response.success).toBe(true);
      expect(response.username).toBe('Alice');
      expect(response.users).toBeDefined();
      expect(response.groups).toBeDefined();
      expect(response.myGroups).toBeDefined();
      expect(response.groupMembers).toBeDefined();
    });

    it('should reject empty username', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const response = await registerClient(client, '');

      expect(response.success).toBe(false);
      expect(response.message).toBe('Username is required');
    });

    it('should reject whitespace-only username', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const response = await registerClient(client, '   ');

      expect(response.success).toBe(false);
      expect(response.message).toBe('Username is required');
    });

    it('should reject duplicate username from different client', async () => {
      const client1 = tracked(createClient());
      const client2 = tracked(createClient());
      await connectClient(client1);
      await connectClient(client2);

      const response1 = await registerClient(client1, 'Bob');
      expect(response1.success).toBe(true);

      const response2 = await registerClient(client2, 'Bob');
      expect(response2.success).toBe(false);
      expect(response2.message).toBe('Username already taken');
    });

    it('should reject username longer than 20 characters', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const longName = 'a'.repeat(21);
      const response = await registerClient(client, longName);

      expect(response.success).toBe(false);
      expect(response.message).toBe('Username too long (max 20 chars)');
    });

    it('should allow idempotent re-registration with same username', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const response1 = await registerClient(client, 'Charlie');
      expect(response1.success).toBe(true);

      const response2 = await registerClient(client, 'Charlie');
      expect(response2.success).toBe(true);
      expect(response2.username).toBe('Charlie');
    });

    it('should reject changing username on same socket', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const response1 = await registerClient(client, 'Dave');
      expect(response1.success).toBe(true);

      const response2 = await registerClient(client, 'Eve');
      expect(response2.success).toBe(false);
      expect(response2.message).toBe(
        'Cannot change username on this connection',
      );
    });
  });

  describe('Messaging', () => {
    it('should broadcast message to other connected clients', async () => {
      const sender = tracked(createClient());
      const receiver = tracked(createClient());
      await connectClient(sender);
      await connectClient(receiver);

      await registerClient(sender, 'Sender');
      await registerClient(receiver, 'Receiver');

      const msgPromise = waitForEvent(receiver, 'receive-message');
      sender.emit('broadcast-message', { message: 'Hello everyone' });
      const msg = await msgPromise;

      expect(msg.sender).toBe('Sender');
      expect(msg.message).toBe('Hello everyone');
      expect(msg.type).toBe('broadcast');
    });

    it('should deliver private message to target user', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      const msgPromise = waitForEvent(bob, 'receive-message');
      alice.emit('private-message', { target: 'Bob', message: 'Hi Bob' });
      const msg = await msgPromise;

      expect(msg.sender).toBe('Alice');
      expect(msg.message).toBe('Hi Bob');
      expect(msg.type).toBe('private');
      expect(msg.target).toBe('Bob');
    });

    it('should emit error when sending private message to invalid target', async () => {
      const alice = tracked(createClient());
      await connectClient(alice);
      await registerClient(alice, 'Alice');

      const errorPromise = waitForEvent(alice, 'error');
      alice.emit('private-message', {
        target: 'NonExistent',
        message: 'Hello',
      });
      const err = await errorPromise;

      expect(err.message).toBe('User not found or offline');
    });

    it('should deliver group message to other group members', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      // Alice creates group
      const groupsUpdatedPromise = waitForEvent(bob, 'groups-updated');
      alice.emit('create-group', { name: 'devs' });
      await groupsUpdatedPromise;

      // Bob joins group
      const joinPromise = waitForEvent(bob, 'group-member-joined');
      bob.emit('join-group', { name: 'devs' });
      await joinPromise;

      // Alice sends group message
      const msgPromise = waitForEvent(bob, 'receive-message');
      alice.emit('group-message', { group: 'devs', message: 'Hello devs' });
      const msg = await msgPromise;

      expect(msg.sender).toBe('Alice');
      expect(msg.message).toBe('Hello devs');
      expect(msg.type).toBe('group');
      expect(msg.group).toBe('devs');
    });

    it('should emit error when sending group message to group user is not member of', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      // Alice creates group (Bob is not a member)
      const groupsUpdatedPromise = waitForEvent(bob, 'groups-updated');
      alice.emit('create-group', { name: 'secret' });
      await groupsUpdatedPromise;

      // Bob tries to send message to group he's not in
      const errorPromise = waitForEvent(bob, 'error');
      bob.emit('group-message', { group: 'secret', message: 'Sneaky' });
      const err = await errorPromise;

      expect(err.message).toBe('Not a member of this group');
    });
  });

  describe('Groups', () => {
    it('should create group and broadcast groups-updated', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      const updatedPromise = waitForEvent(bob, 'groups-updated');
      alice.emit('create-group', { name: 'team' });
      const updated = await updatedPromise;

      expect(updated.groups).toContain('team');
    });

    it('should emit group-member-joined when user joins group', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      // Alice creates group
      const aliceUpdated = waitForEvent(alice, 'groups-updated');
      alice.emit('create-group', { name: 'cool' });
      await aliceUpdated;

      // Bob joins group — Alice should get group-member-joined
      const joinedPromise = waitForEvent(alice, 'group-member-joined');
      bob.emit('join-group', { name: 'cool' });
      const joined = await joinedPromise;

      expect(joined.group).toBe('cool');
      expect(joined.username).toBe('Bob');
    });

    it('should emit group-member-left when user leaves group', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      // Alice creates group
      const aliceUpdated = waitForEvent(alice, 'groups-updated');
      alice.emit('create-group', { name: 'team2' });
      await aliceUpdated;

      // Bob joins group
      const bobJoined = waitForEvent(alice, 'group-member-joined');
      bob.emit('join-group', { name: 'team2' });
      await bobJoined;

      // Bob leaves group — Alice should get group-member-left
      const leftPromise = waitForEvent(alice, 'group-member-left');
      bob.emit('leave-group', { name: 'team2' });
      const left = await leftPromise;

      expect(left.group).toBe('team2');
      expect(left.username).toBe('Bob');
    });

    it('should delete group when last member leaves', async () => {
      const alice = tracked(createClient());
      const bob = tracked(createClient());
      await connectClient(alice);
      await connectClient(bob);

      await registerClient(alice, 'Alice');
      await registerClient(bob, 'Bob');

      // Alice creates group
      const bobUpdated1 = waitForEvent(bob, 'groups-updated');
      alice.emit('create-group', { name: 'temp' });
      await bobUpdated1;

      // Alice leaves (she's the only member)
      const bobUpdated2 = waitForEvent(bob, 'groups-updated');
      alice.emit('leave-group', { name: 'temp' });
      const updated = await bobUpdated2;

      expect(updated.groups).not.toContain('temp');
    });
  });

  describe('Dashboard', () => {
    it('should subscribe to dashboard and receive stats-update and logs-history', async () => {
      const client = tracked(createClient());
      await connectClient(client);

      const statsPromise = waitForEvent(client, 'stats-update');
      const logsPromise = waitForEvent(client, 'logs-history');
      client.emit('subscribe-dashboard', { password: '' });

      const stats = await statsPromise;
      const logs = await logsPromise;

      expect(stats).toHaveProperty('onlineUsers');
      expect(stats).toHaveProperty('activeGroups');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('totalGroupMessages');
      expect(stats).toHaveProperty('totalPrivateMessages');
      expect(stats).toHaveProperty('totalBroadcasts');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('uptime');
      expect(logs).toHaveProperty('logs');
      expect(Array.isArray(logs.logs)).toBe(true);
    });

    it('should emit error with wrong password when DASHBOARD_PASSWORD is set', async () => {
      const originalPassword = process.env.DASHBOARD_PASSWORD;
      process.env.DASHBOARD_PASSWORD = 'secret123';

      try {
        const client = tracked(createClient());
        await connectClient(client);

        const errorPromise = waitForEvent(client, 'error');
        client.emit('subscribe-dashboard', { password: 'wrong' });
        const err = await errorPromise;

        expect(err.message).toBe(
          'Unauthorized: incorrect dashboard password',
        );
      } finally {
        if (originalPassword !== undefined) {
          process.env.DASHBOARD_PASSWORD = originalPassword;
        } else {
          delete process.env.DASHBOARD_PASSWORD;
        }
      }
    });
  });
});
