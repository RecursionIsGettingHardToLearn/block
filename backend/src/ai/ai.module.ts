import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AnomalyService } from './anomaly.service';

@Module({
  controllers: [AiController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AiModule {}
