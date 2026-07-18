import { Global, Module } from '@nestjs/common';
import { ChatStore } from './stores/chat.store';
import { ServerMonitorService } from './server-monitor.service';

@Global()
@Module({
  providers: [ChatStore, ServerMonitorService],
  exports: [ChatStore, ServerMonitorService],
})
export class SharedModule {}
