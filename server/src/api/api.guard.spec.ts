import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiGuard } from './api.guard';

function createMockContext(options: {
  authorization?: string;
  queryPassword?: string;
}): ExecutionContext {
  const request = {
    headers: {} as Record<string, string>,
    query: {} as Record<string, string>,
  };

  if (options.authorization) {
    request.headers['authorization'] = options.authorization;
  }
  if (options.queryPassword !== undefined) {
    request.query['password'] = options.queryPassword;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiGuard', () => {
  let guard: ApiGuard;
  const originalEnv = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    guard = new ApiGuard();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DASHBOARD_PASSWORD;
    } else {
      process.env.DASHBOARD_PASSWORD = originalEnv;
    }
  });

  describe('canActivate - development mode (no password)', () => {
    it('should allow access when DASHBOARD_PASSWORD is not set', () => {
      delete process.env.DASHBOARD_PASSWORD;
      const context = createMockContext({});
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access when DASHBOARD_PASSWORD is empty string', () => {
      process.env.DASHBOARD_PASSWORD = '';
      const context = createMockContext({});
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('canActivate - password set', () => {
    beforeEach(() => {
      process.env.DASHBOARD_PASSWORD = 'secret123';
    });

    it('should allow access with correct password via query parameter', () => {
      const context = createMockContext({ queryPassword: 'secret123' });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access with correct password via Basic Auth', () => {
      const encoded = Buffer.from('admin:secret123').toString('base64');
      const context = createMockContext({
        authorization: `Basic ${encoded}`,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow access with correct password via Bearer token', () => {
      const context = createMockContext({
        authorization: 'Bearer secret123',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should throw UnauthorizedException when no password provided', () => {
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with correct message', () => {
      const context = createMockContext({});
      expect(() => guard.canActivate(context)).toThrow(
        'Unauthorized. Provide password via ?password=, Basic Auth, or Bearer token.',
      );
    });

    it('should throw UnauthorizedException when wrong password via query', () => {
      const context = createMockContext({ queryPassword: 'wrongpassword' });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when wrong password via Basic Auth', () => {
      const encoded = Buffer.from('admin:wrongpassword').toString('base64');
      const context = createMockContext({
        authorization: `Basic ${encoded}`,
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when wrong password via Bearer token', () => {
      const context = createMockContext({
        authorization: 'Bearer wrongpassword',
      });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('extractPassword - Basic Auth', () => {
    beforeEach(() => {
      process.env.DASHBOARD_PASSWORD = 'mypass';
    });

    it('should extract password from Basic Auth with user:password format', () => {
      const encoded = Buffer.from('user:mypass').toString('base64');
      const context = createMockContext({
        authorization: `Basic ${encoded}`,
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle Basic Auth with empty password part', () => {
      const encoded = Buffer.from('user:').toString('base64');
      const context = createMockContext({
        authorization: `Basic ${encoded}`,
      });
      // Empty password doesn't match 'mypass'
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('extractPassword - query parameter', () => {
    beforeEach(() => {
      process.env.DASHBOARD_PASSWORD = 'querytest';
    });

    it('should extract password from query parameter', () => {
      const context = createMockContext({ queryPassword: 'querytest' });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('extractPassword - Bearer token', () => {
    beforeEach(() => {
      process.env.DASHBOARD_PASSWORD = 'bearertest';
    });

    it('should extract password from Bearer token', () => {
      const context = createMockContext({
        authorization: 'Bearer bearertest',
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
