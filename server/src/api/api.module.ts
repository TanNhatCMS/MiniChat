import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiGuard } from './api.guard';

@Module({
  controllers: [ApiController],
  providers: [ApiGuard],
})
export class ApiModule {}
