import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiGuard } from './api.guard';

/**
 * Helper to create a mock ExecutionContext with configurable request properties.
 */
function createMockContext(options: {
  authorization?: string;
  queryPassword?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): ExecutionContext {
  const request = {
    headers: { ...(options.headers || {}) } as Record<string, string>,
    query: { ...(options.query || {}) } as Record<string, string>,
  };

  if (options.authorization !== undefined) {
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

describe('ApiGuard - Property Tests', () => {
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

  /**
   * Property 1: Guard cho phép tự do khi không có password
   *
   * For ANY arbitrary request (random headers, query params, auth values),
   * when DASHBOARD_PASSWORD is not set, canActivate always returns true.
   *
   * **Validates: Requirements 3.2**
   */
  describe('Property 1: Open access without password', () => {
    it('should always return true when DASHBOARD_PASSWORD is not set, regardless of request content', () => {
      fc.assert(
        fc.property(
          fc.record({
            authorization: fc.option(fc.string(), { nil: undefined }),
            queryPassword: fc.option(fc.string(), { nil: undefined }),
            randomHeader: fc.option(fc.string(), { nil: undefined }),
          }),
          (inputs) => {
            delete process.env.DASHBOARD_PASSWORD;

            const context = createMockContext({
              authorization: inputs.authorization,
              queryPassword: inputs.queryPassword,
              headers: inputs.randomHeader
                ? { 'x-custom': inputs.randomHeader }
                : {},
            });

            expect(guard.canActivate(context)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('should always return true when DASHBOARD_PASSWORD is empty string, regardless of request content', () => {
      fc.assert(
        fc.property(
          fc.record({
            authorization: fc.option(fc.unicodeString(), { nil: undefined }),
            queryPassword: fc.option(fc.unicodeString(), { nil: undefined }),
          }),
          (inputs) => {
            process.env.DASHBOARD_PASSWORD = '';

            const context = createMockContext({
              authorization: inputs.authorization,
              queryPassword: inputs.queryPassword,
            });

            expect(guard.canActivate(context)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property 2: Guard từ chối password sai với JSON 401
   *
   * For ANY non-empty string password that differs from DASHBOARD_PASSWORD,
   * canActivate always throws UnauthorizedException.
   *
   * **Validates: Requirements 3.1, 3.6**
   */
  describe('Property 2: Reject wrong passwords with UnauthorizedException', () => {
    it('should throw UnauthorizedException for any password that does not match DASHBOARD_PASSWORD', () => {
      fc.assert(
        fc.property(
          // Generate a non-empty dashboard password
          fc.string({ minLength: 1 }),
          // Generate a wrong password that differs from the dashboard password
          fc.string(),
          (dashboardPassword, attemptedPassword) => {
            // Ensure the attempted password is different from the dashboard password
            fc.pre(attemptedPassword !== dashboardPassword);

            process.env.DASHBOARD_PASSWORD = dashboardPassword;

            const context = createMockContext({
              queryPassword: attemptedPassword,
            });

            expect(() => guard.canActivate(context)).toThrow(
              UnauthorizedException,
            );
          },
        ),
        { numRuns: 200 },
      );
    });

    it('should throw UnauthorizedException when no password is provided and DASHBOARD_PASSWORD is set', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (dashboardPassword) => {
            process.env.DASHBOARD_PASSWORD = dashboardPassword;

            const context = createMockContext({});

            expect(() => guard.canActivate(context)).toThrow(
              UnauthorizedException,
            );
          },
        ),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property 3: Password extraction từ 3 methods
   *
   * For ANY password string, when set as DASHBOARD_PASSWORD, sending that same
   * password via Basic Auth OR query param OR Bearer token always grants access.
   *
   * **Validates: Requirements 3.3, 3.4, 3.5**
   */
  describe('Property 3: All 3 extraction methods grant access with correct password', () => {
    it('should grant access via Basic Auth for any password', () => {
      fc.assert(
        fc.property(
          // Password must be non-empty (otherwise DASHBOARD_PASSWORD would be falsy = open access)
          fc.string({ minLength: 1 }).filter((s) => !s.includes(':')),
          (password) => {
            process.env.DASHBOARD_PASSWORD = password;

            const encoded = Buffer.from(`user:${password}`).toString('base64');
            const context = createMockContext({
              authorization: `Basic ${encoded}`,
            });

            expect(guard.canActivate(context)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('should grant access via query parameter for any password', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (password) => {
            process.env.DASHBOARD_PASSWORD = password;

            const context = createMockContext({
              queryPassword: password,
            });

            expect(guard.canActivate(context)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('should grant access via Bearer token for any password', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (password) => {
            process.env.DASHBOARD_PASSWORD = password;

            const context = createMockContext({
              authorization: `Bearer ${password}`,
            });

            expect(guard.canActivate(context)).toBe(true);
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
