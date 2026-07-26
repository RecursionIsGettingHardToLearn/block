import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [AuditController],
})
export class AuditModule {}
