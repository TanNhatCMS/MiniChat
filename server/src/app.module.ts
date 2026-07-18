import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { ApiModule } from './api/api.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [SharedModule, ChatModule, ApiModule],
})
export class AppModule {}
