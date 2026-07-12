import { IsEnum } from 'class-validator';
import type { ElectionStatus } from '../elections.service';

export class UpdateElectionStatusDto {
  @IsEnum(['BORRADOR', 'PROGRAMADA', 'ACTIVA', 'CERRADA', 'ESCRUTADA'], {
    message:
      'status must be one of: BORRADOR, PROGRAMADA, ACTIVA, CERRADA, ESCRUTADA',
  })
  status: ElectionStatus;
}
