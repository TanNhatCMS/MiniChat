import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the os module at module level for ESM compatibility
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    totalmem: vi.fn(() => 8_000_000_000),
    freemem: vi.fn(() => 4_000_000_000),
  };
});

import * as os from 'os';
import { ServerMonitorService } from './server-monitor.service';

/**
 * **Validates: Requirements 1.1, 2.2, 4.3, 4.4**
 */
describe('ServerMonitorService - Property Tests', () => {
  let service: ServerMonitorService;

  const mockedTotalmem = vi.mocked(os.totalmem);
  const mockedFreemem = vi.mocked(os.freemem);

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ServerMonitorService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Feature: dashboard-server-status, Property 4: ServerStatus response schema completeness
  describe('Property 4: ServerStatus response schema completeness', () => {
    it('getStatus() returns all required fields for any valid system state', () => {
      fc.assert(
        fc.property(
          fc.record({
            heapUsed: fc.nat({ max: 4_000_000_000 }),
            heapTotal: fc.nat({ max: 4_000_000_000 }),
            rss: fc.nat({ max: 8_000_000_000 }),
            external: fc.nat({ max: 1_000_000_000 }),
            arrayBuffers: fc.nat({ max: 1_000_000_000 }),
          }),
          fc.record({
            totalMem: fc.integer({ min: 1, max: 64_000_000_000 }),
            freeMem: fc.nat({ max: 64_000_000_000 }),
          }),
          fc.nat({ max: 10_000_000 }),
          fc.record({
            user: fc.nat({ max: 10_000_000 }),
            system: fc.nat({ max: 10_000_000 }),
          }),
          (memValues, systemMem, uptimeSeconds, cpuValues) => {
            // Ensure freeMem <= totalMem
            const freeMem = Math.min(systemMem.freeMem, systemMem.totalMem);

            vi.spyOn(process, 'memoryUsage').mockReturnValue({
              heapUsed: memValues.heapUsed,
              heapTotal: Math.max(memValues.heapTotal, memValues.heapUsed),
              rss: memValues.rss,
              external: memValues.external,
              arrayBuffers: memValues.arrayBuffers,
            } as ReturnType<typeof process.memoryUsage>);

            mockedTotalmem.mockReturnValue(systemMem.totalMem);
            mockedFreemem.mockReturnValue(freeMem);
            vi.spyOn(process, 'uptime').mockReturnValue(uptimeSeconds);
            vi.spyOn(process, 'cpuUsage').mockReturnValue(cpuValues);

            const status = service.getStatus();

            // Verify all required top-level fields exist
            expect(status).toHaveProperty('cpu');
            expect(status).toHaveProperty('memory');
            expect(status).toHaveProperty('uptime');
            expect(status).toHaveProperty('runtime');
            expect(status).toHaveProperty('timestamp');

            // Verify cpu fields
            expect(status.cpu).toHaveProperty('usagePercent');
            expect(typeof status.cpu.usagePercent).toBe('number');

            // Verify memory fields
            expect(status.memory).toHaveProperty('heapUsedMB');
            expect(status.memory).toHaveProperty('heapTotalMB');
            expect(status.memory).toHaveProperty('heapUsagePercent');
            expect(status.memory).toHaveProperty('systemTotalMB');
            expect(status.memory).toHaveProperty('systemFreeMB');
            expect(status.memory).toHaveProperty('systemUsedMB');
            expect(status.memory).toHaveProperty('systemUsagePercent');
            expect(typeof status.memory.heapUsedMB).toBe('number');
            expect(typeof status.memory.heapTotalMB).toBe('number');
            expect(typeof status.memory.heapUsagePercent).toBe('number');
            expect(typeof status.memory.systemTotalMB).toBe('number');
            expect(typeof status.memory.systemFreeMB).toBe('number');
            expect(typeof status.memory.systemUsedMB).toBe('number');
            expect(typeof status.memory.systemUsagePercent).toBe('number');

            // Verify uptime fields
            expect(status.uptime).toHaveProperty('days');
            expect(status.uptime).toHaveProperty('hours');
            expect(status.uptime).toHaveProperty('minutes');
            expect(status.uptime).toHaveProperty('seconds');
            expect(status.uptime).toHaveProperty('totalSeconds');

            // Verify runtime fields
            expect(status.runtime).toHaveProperty('nodeVersion');
            expect(status.runtime).toHaveProperty('platform');
            expect(typeof status.runtime.nodeVersion).toBe('string');
            expect(typeof status.runtime.platform).toBe('string');

            // Verify timestamp is valid ISO string
            expect(typeof status.timestamp).toBe('string');
            expect(new Date(status.timestamp).toISOString()).toBe(
              status.timestamp,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: dashboard-server-status, Property 5: Memory usage percentage consistency
  describe('Property 5: Memory usage percentage consistency', () => {
    it('heapUsagePercent is computed correctly and in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 4_000_000_000 }),
          fc.integer({ min: 1, max: 4_000_000_000 }),
          (heapUsed, heapTotal) => {
            // Ensure used <= total
            const actualUsed = Math.min(heapUsed, heapTotal);
            const actualTotal = heapTotal;

            vi.spyOn(process, 'memoryUsage').mockReturnValue({
              heapUsed: actualUsed,
              heapTotal: actualTotal,
              rss: actualTotal,
              external: 0,
              arrayBuffers: 0,
            } as ReturnType<typeof process.memoryUsage>);

            mockedTotalmem.mockReturnValue(8_000_000_000);
            mockedFreemem.mockReturnValue(4_000_000_000);
            vi.spyOn(process, 'uptime').mockReturnValue(1000);
            vi.spyOn(process, 'cpuUsage').mockReturnValue({
              user: 100000,
              system: 50000,
            });

            const status = service.getStatus();

            // Verify correct computation
            const expectedPercent =
              Math.round((actualUsed / actualTotal) * 1000) / 10;
            expect(status.memory.heapUsagePercent).toBe(expectedPercent);

            // Verify bounded [0, 100]
            expect(status.memory.heapUsagePercent).toBeGreaterThanOrEqual(0);
            expect(status.memory.heapUsagePercent).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('systemUsagePercent is computed correctly and in [0, 100]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 64_000_000_000 }),
          fc.integer({ min: 0, max: 64_000_000_000 }),
          (totalMem, freeMem) => {
            // Ensure free <= total
            const actualFree = Math.min(freeMem, totalMem);

            vi.spyOn(process, 'memoryUsage').mockReturnValue({
              heapUsed: 100_000_000,
              heapTotal: 200_000_000,
              rss: 300_000_000,
              external: 0,
              arrayBuffers: 0,
            } as ReturnType<typeof process.memoryUsage>);

            mockedTotalmem.mockReturnValue(totalMem);
            mockedFreemem.mockReturnValue(actualFree);
            vi.spyOn(process, 'uptime').mockReturnValue(1000);
            vi.spyOn(process, 'cpuUsage').mockReturnValue({
              user: 100000,
              system: 50000,
            });

            const status = service.getStatus();

            // Verify correct computation
            const usedMem = totalMem - actualFree;
            const expectedPercent =
              Math.round((usedMem / totalMem) * 1000) / 10;
            expect(status.memory.systemUsagePercent).toBe(expectedPercent);

            // Verify bounded [0, 100]
            expect(status.memory.systemUsagePercent).toBeGreaterThanOrEqual(0);
            expect(status.memory.systemUsagePercent).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('heapUsagePercent is 0 when heapTotal is 0 (division-by-zero guard)', () => {
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 0,
        heapTotal: 0,
        rss: 0,
        external: 0,
        arrayBuffers: 0,
      } as ReturnType<typeof process.memoryUsage>);

      mockedTotalmem.mockReturnValue(8_000_000_000);
      mockedFreemem.mockReturnValue(4_000_000_000);
      vi.spyOn(process, 'uptime').mockReturnValue(1000);
      vi.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 100000,
        system: 50000,
      });

      const status = service.getStatus();
      expect(status.memory.heapUsagePercent).toBe(0);
    });

    it('systemUsagePercent is 0 when totalMem is 0 (division-by-zero guard)', () => {
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 100_000_000,
        heapTotal: 200_000_000,
        rss: 300_000_000,
        external: 0,
        arrayBuffers: 0,
      } as ReturnType<typeof process.memoryUsage>);

      mockedTotalmem.mockReturnValue(0);
      mockedFreemem.mockReturnValue(0);
      vi.spyOn(process, 'uptime').mockReturnValue(1000);
      vi.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 100000,
        system: 50000,
      });

      const status = service.getStatus();
      expect(status.memory.systemUsagePercent).toBe(0);
    });
  });

  // Feature: dashboard-server-status, Property 6: CPU percentage is bounded
  describe('Property 6: CPU percentage is bounded', () => {
    it('cpu.usagePercent is always in [0, 100] for any measurement interval', () => {
      fc.assert(
        fc.property(
          fc.record({
            prevUser: fc.nat({ max: 100_000_000 }),
            prevSystem: fc.nat({ max: 100_000_000 }),
          }),
          fc.record({
            deltaUser: fc.nat({ max: 200_000_000 }),
            deltaSystem: fc.nat({ max: 200_000_000 }),
          }),
          fc.integer({ min: 1, max: 60_000 }),
          (prevCpu, deltaCpu, elapsedMs) => {
            // CPU usage values are cumulative
            const currUser = prevCpu.prevUser + deltaCpu.deltaUser;
            const currSystem = prevCpu.prevSystem + deltaCpu.deltaSystem;

            const now = 1_000_000;
            vi.spyOn(Date, 'now')
              .mockReturnValueOnce(now)
              .mockReturnValueOnce(now + elapsedMs);
            vi.spyOn(process, 'cpuUsage')
              .mockReturnValueOnce({
                user: prevCpu.prevUser,
                system: prevCpu.prevSystem,
              })
              .mockReturnValueOnce({
                user: currUser,
                system: currSystem,
              });
            vi.spyOn(process, 'memoryUsage').mockReturnValue({
              heapUsed: 100_000_000,
              heapTotal: 200_000_000,
              rss: 300_000_000,
              external: 0,
              arrayBuffers: 0,
            } as ReturnType<typeof process.memoryUsage>);
            mockedTotalmem.mockReturnValue(8_000_000_000);
            mockedFreemem.mockReturnValue(4_000_000_000);
            vi.spyOn(process, 'uptime').mockReturnValue(1000);

            // Create a fresh service to control cpu state
            const testService = new ServerMonitorService();

            // First call initializes the previous CPU state
            testService.getStatus();

            // Second call computes the CPU delta
            const status = testService.getStatus();

            // CPU usage must be clamped to [0, 100]
            expect(status.cpu.usagePercent).toBeGreaterThanOrEqual(0);
            expect(status.cpu.usagePercent).toBeLessThanOrEqual(100);

            testService.onModuleDestroy();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
