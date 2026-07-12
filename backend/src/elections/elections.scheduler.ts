import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ElectionsService } from './elections.service';

@Injectable()
export class ElectionsScheduler {
  private readonly logger = new Logger(ElectionsScheduler.name);

  constructor(private readonly electionsService: ElectionsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredElections(): Promise<void> {
    try {
      const count = await this.electionsService.closeExpiredElections();
      if (count > 0) {
        this.logger.log(
          `Auto-cierre: ${count} elección(es) cerrada(s) por vencimiento`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Error en cierre automático: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
