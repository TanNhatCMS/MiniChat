import { Global, Module } from '@nestjs/common';
import { ChatStore } from './stores/chat.store';

@Global()
@Module({
  providers: [ChatStore],
  exports: [ChatStore],
})
export class SharedModule {}
