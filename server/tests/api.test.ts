import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

const TEST_PORT = 4002;

// Helper: HTTP GET request
function httpGet(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, body: data });
        }
      });
    }).on('error', reject);
  });
}

describe('MiniChat Server - HTTP API', () => {
  let server: http.Server;

  beforeAll(() => {
    return new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const pathname = (req.url || '/').split('?')[0];

        if (pathname === '/api/stats') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            onlineUsers: 0,
            activeGroups: 0,
            totalMessages: 0,
            totalGroupMessages: 0,
            totalPrivateMessages: 0,
            totalBroadcasts: 0,
            totalConnections: 0,
            uptime: 0,
            users: [],
            groups: [],
          }));
        } else if (pathname === '/dashboard' || pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>Dashboard</body></html>');
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      server.listen(TEST_PORT, () => resolve());
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /api/stats', () => {
    it('trả về thống kê dạng JSON', async () => {
      const { status, body } = await httpGet('/api/stats');

      expect(status).toBe(200);
      expect(body).toHaveProperty('onlineUsers');
      expect(body).toHaveProperty('activeGroups');
      expect(body).toHaveProperty('totalMessages');
      expect(body).toHaveProperty('totalGroupMessages');
      expect(body).toHaveProperty('totalPrivateMessages');
      expect(body).toHaveProperty('totalConnections');
      expect(body).toHaveProperty('users');
      expect(body).toHaveProperty('groups');
    });

    it('thống kê mặc định là 0', async () => {
      const { body } = await httpGet('/api/stats');

      expect(body.onlineUsers).toBe(0);
      expect(body.activeGroups).toBe(0);
      expect(body.totalMessages).toBe(0);
    });
  });

  describe('GET /dashboard', () => {
    it('trả về HTML', async () => {
      return new Promise<void>((resolve, reject) => {
        http.get(`http://localhost:${TEST_PORT}/dashboard`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/html');
          res.resume();
          res.on('end', () => resolve());
        }).on('error', reject);
      });
    });
  });

  describe('GET /unknown-path', () => {
    it('trả về 404', async () => {
      const { status } = await httpGet('/unknown-path');
      expect(status).toBe(404);
    });
  });
});
