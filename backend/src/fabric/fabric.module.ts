import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FabricController } from './fabric.controller';
import { FabricService } from './fabric.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [FabricController],
  providers: [FabricService],
  exports: [FabricService],
})
export class FabricModule {}
