import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '../api/api.module';
import { SharedModule } from '../shared/shared.module';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

describe('API Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SharedModule, ApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /', () => {
    it('returns 200 with status ok and uptime as number', async () => {
      const res = await request(app.getHttpServer()).get('/');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('responds with content-type application/json', async () => {
      const res = await request(app.getHttpServer()).get('/');

      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /api/stats', () => {
    afterEach(() => {
      delete process.env.DASHBOARD_PASSWORD;
    });

    it('without DASHBOARD_PASSWORD set: returns 200 with DashboardStats structure (open access)', async () => {
      delete process.env.DASHBOARD_PASSWORD;

      const res = await request(app.getHttpServer()).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('onlineUsers');
      expect(res.body).toHaveProperty('activeGroups');
      expect(res.body).toHaveProperty('totalMessages');
      expect(res.body).toHaveProperty('totalGroupMessages');
      expect(res.body).toHaveProperty('totalPrivateMessages');
      expect(res.body).toHaveProperty('totalBroadcasts');
      expect(res.body).toHaveProperty('totalConnections');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('groups');
    });

    it('with DASHBOARD_PASSWORD set and correct query param: returns 200', async () => {
      process.env.DASHBOARD_PASSWORD = 'secret123';

      const res = await request(app.getHttpServer()).get('/api/stats?password=secret123');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('onlineUsers');
    });

    it('with DASHBOARD_PASSWORD set and no auth: returns 401', async () => {
      process.env.DASHBOARD_PASSWORD = 'secret123';

      const res = await request(app.getHttpServer()).get('/api/stats');

      expect(res.status).toBe(401);
    });

    it('with DASHBOARD_PASSWORD set and wrong auth: returns 401', async () => {
      process.env.DASHBOARD_PASSWORD = 'secret123';

      const res = await request(app.getHttpServer()).get('/api/stats?password=wrong');

      expect(res.status).toBe(401);
    });

    it('returns JSON with statusCode and message when unauthorized', async () => {
      process.env.DASHBOARD_PASSWORD = 'secret123';

      const res = await request(app.getHttpServer()).get('/api/stats');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('statusCode', 401);
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('GET /api/logs', () => {
    afterEach(() => {
      delete process.env.DASHBOARD_PASSWORD;
    });

    it('without DASHBOARD_PASSWORD set: returns 200 with logs array', async () => {
      delete process.env.DASHBOARD_PASSWORD;

      const res = await request(app.getHttpServer()).get('/api/logs');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    it('with auth: returns 200 with logs array', async () => {
      process.env.DASHBOARD_PASSWORD = 'mypassword';

      const res = await request(app.getHttpServer()).get('/api/logs?password=mypassword');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    it('without auth when password required: returns 401', async () => {
      process.env.DASHBOARD_PASSWORD = 'mypassword';

      const res = await request(app.getHttpServer()).get('/api/logs');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('statusCode', 401);
    });
  });

  describe('404 Not Found', () => {
    it('GET /nonexistent returns 404 with proper JSON error', async () => {
      const res = await request(app.getHttpServer()).get('/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('message');
    });
  });
});
