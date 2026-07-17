import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ReportsAiService } from './reports-ai.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsAiService],
})
export class ReportsModule {}
