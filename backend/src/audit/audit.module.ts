import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AnomalyService } from './anomaly.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AnomalyService],
})
export class AuditModule {}
