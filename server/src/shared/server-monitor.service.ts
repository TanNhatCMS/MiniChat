import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as os from 'os';
import { Server } from 'socket.io';
import {
  ServerStatus,
  bytesToMB,
  secondsToBreakdown,
} from './server-monitor.utils';

@Injectable()
export class ServerMonitorService implements OnModuleInit, OnModuleDestroy {
  private intervalHandle: NodeJS.Timeout | null = null;
  private server: Server | null = null;
  private previousCpuUsage: { user: number; system: number } | null = null;
  private previousCpuTime: number = 0;

  onModuleInit(): void {
    this.startBroadcasting();
  }

  onModuleDestroy(): void {
    this.stopBroadcasting();
  }

  setServer(server: Server): void {
    this.server = server;
  }

  getStatus(): ServerStatus {
    const cpuUsagePercent = this.computeCpuUsage();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const heapUsedMB = bytesToMB(memUsage.heapUsed);
    const heapTotalMB = bytesToMB(memUsage.heapTotal);
    const heapUsagePercent =
      memUsage.heapTotal === 0
        ? 0
        : Math.round((memUsage.heapUsed / memUsage.heapTotal) * 1000) / 10;

    const systemTotalMB = bytesToMB(totalMem);
    const systemFreeMB = bytesToMB(freeMem);
    const systemUsedMB = bytesToMB(totalMem - freeMem);
    const systemUsagePercent =
      totalMem === 0
        ? 0
        : Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10;

    const uptimeSeconds = Math.floor(process.uptime());
    const uptime = secondsToBreakdown(uptimeSeconds);

    return {
      cpu: {
        usagePercent: cpuUsagePercent,
      },
      memory: {
        heapUsedMB,
        heapTotalMB,
        heapUsagePercent,
        systemTotalMB,
        systemFreeMB,
        systemUsedMB,
        systemUsagePercent,
      },
      uptime,
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
      },
      timestamp: new Date().toISOString(),
    };
  }

  startBroadcasting(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      this.emitStatusNow();
    }, 5000);
  }

  stopBroadcasting(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  emitStatusNow(): void {
    if (!this.server) {
      return;
    }

    const status = this.getStatus();
    this.server.to('dashboard').emit('server-status-update', status);
  }

  private computeCpuUsage(): number {
    const currentCpuUsage = process.cpuUsage();
    const now = Date.now();

    if (!this.previousCpuUsage) {
      this.previousCpuUsage = {
        user: currentCpuUsage.user,
        system: currentCpuUsage.system,
      };
      this.previousCpuTime = now;
      return 0;
    }

    const elapsedMs = now - this.previousCpuTime;
    if (elapsedMs <= 0) {
      return 0;
    }

    const userDelta = currentCpuUsage.user - this.previousCpuUsage.user;
    const systemDelta = currentCpuUsage.system - this.previousCpuUsage.system;
    const totalCpuMicros = userDelta + systemDelta;

    // Convert elapsed time to microseconds for comparison
    const elapsedMicros = elapsedMs * 1000;

    // CPU usage as percentage of elapsed time
    const usagePercent = (totalCpuMicros / elapsedMicros) * 100;

    // Update previous snapshot
    this.previousCpuUsage = {
      user: currentCpuUsage.user,
      system: currentCpuUsage.system,
    };
    this.previousCpuTime = now;

    // Clamp to [0, 100]
    return Math.round(Math.min(100, Math.max(0, usagePercent)) * 10) / 10;
  }
}
