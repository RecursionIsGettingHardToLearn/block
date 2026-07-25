import { Module } from '@nestjs/common';
import { NavAssistantController } from './nav-assistant.controller';
import { NavAssistantService } from './nav-assistant.service';

@Module({
  controllers: [NavAssistantController],
  providers: [NavAssistantService],
})
export class NavAssistantModule {}
