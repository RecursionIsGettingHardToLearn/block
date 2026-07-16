import { IsEnum } from 'class-validator';
import type { ElectionStatus } from '../elections.service';

export class UpdateElectionStatusDto {
  @IsEnum(['BORRADOR', 'PROGRAMADA', 'ACTIVA', 'CERRADA', 'ESCRUTADA'], {
    message:
      'El estado debe ser uno de: BORRADOR, PROGRAMADA, ACTIVA, CERRADA o ESCRUTADA',
  })
  status: ElectionStatus;
}
