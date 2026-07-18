import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ApiModule } from '../api/api.module';
import { SharedModule } from './shared.module';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { ChatService } from '../chat/chat.service';
import { ChatStore } from './stores/chat.store';
import { ServerMonitorService } from './server-monitor.service';

// --- API Endpoint Tests (Requirements 2.1, 2.2, 2.3, 2.4) ---

describe('GET /api/server-status', () => {
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

  afterEach(() => {
    delete process.env.DASHBOARD_PASSWORD;
  });

  it('returns 200 with valid auth and contains ServerStatus fields', async () => {
    process.env.DASHBOARD_PASSWORD = 'testpass';

    const res = await request(app.getHttpServer())
      .get('/api/server-status?password=testpass');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cpu');
    expect(res.body.cpu).toHaveProperty('usagePercent');
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory).toHaveProperty('heapUsedMB');
    expect(res.body.memory).toHaveProperty('heapTotalMB');
    expect(res.body.memory).toHaveProperty('heapUsagePercent');
    expect(res.body.memory).toHaveProperty('systemTotalMB');
    expect(res.body.memory).toHaveProperty('systemFreeMB');
    expect(res.body.memory).toHaveProperty('systemUsedMB');
    expect(res.body.memory).toHaveProperty('systemUsagePercent');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body.uptime).toHaveProperty('days');
    expect(res.body.uptime).toHaveProperty('hours');
    expect(res.body.uptime).toHaveProperty('minutes');
    expect(res.body.uptime).toHaveProperty('seconds');
    expect(res.body.uptime).toHaveProperty('totalSeconds');
    expect(res.body).toHaveProperty('runtime');
    expect(res.body.runtime).toHaveProperty('nodeVersion');
    expect(res.body.runtime).toHaveProperty('platform');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns 200 without password when DASHBOARD_PASSWORD is not set (open access)', async () => {
    delete process.env.DASHBOARD_PASSWORD;

    const res = await request(app.getHttpServer())
      .get('/api/server-status');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cpu');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('runtime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns 401 without auth when password is required', async () => {
    process.env.DASHBOARD_PASSWORD = 'secret';

    const res = await request(app.getHttpServer())
      .get('/api/server-status');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('statusCode', 401);
    expect(res.body).toHaveProperty('message');
  });

  it('returns 401 with wrong password', async () => {
    process.env.DASHBOARD_PASSWORD = 'correct';

    const res = await request(app.getHttpServer())
      .get('/api/server-status?password=wrong');

    expect(res.status).toBe(401);
  });

  it('returns 200 with correct Bearer token', async () => {
    process.env.DASHBOARD_PASSWORD = 'bearerpass';

    const res = await request(app.getHttpServer())
      .get('/api/server-status')
      .set('Authorization', 'Bearer bearerpass');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cpu');
  });
});

// --- Socket Integration: emitStatusNow called on subscribeDashboard (Requirement 3.2) ---

function createMockSocket(id = 'socket1') {
  return {
    id,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn().mockReturnThis(),
  } as any;
}

function createMockServer() {
  const toEmit = vi.fn();
  return {
    emit: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: toEmit }),
    __toEmit: toEmit,
  } as any;
}

function createMockServerMonitor() {
  return {
    setServer: vi.fn(),
    emitStatusNow: vi.fn(),
    getStatus: vi.fn(),
    startBroadcasting: vi.fn(),
    stopBroadcasting: vi.fn(),
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
  } as unknown as ServerMonitorService;
}

describe('subscribeDashboard - emitStatusNow integration', () => {
  let service: ChatService;
  let store: ChatStore;
  let mockServer: ReturnType<typeof createMockServer>;
  let mockServerMonitor: ServerMonitorService;
  const originalEnv = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    store = new ChatStore();
    mockServerMonitor = createMockServerMonitor();
    service = new ChatService(store, mockServerMonitor);
    mockServer = createMockServer();
    service.setServer(mockServer);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DASHBOARD_PASSWORD;
    } else {
      process.env.DASHBOARD_PASSWORD = originalEnv;
    }
  });

  it('calls emitStatusNow() when a client subscribes to dashboard', () => {
    delete process.env.DASHBOARD_PASSWORD;
    const client = createMockSocket('dash1');

    service.subscribeDashboard(client, { password: '' });

    expect(mockServerMonitor.emitStatusNow).toHaveBeenCalledTimes(1);
  });

  it('calls emitStatusNow() after joining dashboard room with valid password', () => {
    process.env.DASHBOARD_PASSWORD = 'secret';
    const client = createMockSocket('dash2');

    service.subscribeDashboard(client, { password: 'secret' });

    expect(client.join).toHaveBeenCalledWith('dashboard');
    expect(mockServerMonitor.emitStatusNow).toHaveBeenCalledTimes(1);
  });

  it('does NOT call emitStatusNow() when password is incorrect', () => {
    process.env.DASHBOARD_PASSWORD = 'secret';
    const client = createMockSocket('dash3');

    service.subscribeDashboard(client, { password: 'wrong' });

    expect(mockServerMonitor.emitStatusNow).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Unauthorized: incorrect dashboard password',
    });
  });

  it('passes server instance to ServerMonitorService via setServer()', () => {
    expect(mockServerMonitor.setServer).toHaveBeenCalledWith(mockServer);
  });
});
