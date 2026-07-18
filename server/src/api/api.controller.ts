import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiGuard } from './api.guard';
import { ChatStore } from '../shared/stores/chat.store';
import { ServerMonitorService } from '../shared/server-monitor.service';

@Controller()
export class ApiController {
  constructor(
    private readonly store: ChatStore,
    private readonly serverMonitor: ServerMonitorService,
  ) {}

  @Get('/')
  healthCheck() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.store.stats.serverStartTime) / 1000),
    };
  }

  @Get('/api/stats')
  @UseGuards(ApiGuard)
  getStats() {
    return this.store.getDashboardStats();
  }

  @Get('/api/logs')
  @UseGuards(ApiGuard)
  getLogs() {
    return { logs: this.store.activityLogs };
  }

  @Get('/api/server-status')
  @UseGuards(ApiGuard)
  getServerStatus() {
    return this.serverMonitor.getStatus();
  }
}
