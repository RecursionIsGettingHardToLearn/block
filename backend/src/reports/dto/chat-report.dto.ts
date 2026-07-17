import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class ChatTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class ChatReportDto {
  /** 'red' (admin) o 'eleccion' (auditor). */
  @IsIn(['red', 'eleccion'])
  tipo: 'red' | 'eleccion';

  /** Requerido cuando tipo = 'eleccion'. */
  @IsOptional()
  @IsUUID()
  electionId?: string;

  @IsString()
  pregunta: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  historial?: ChatTurnDto[];
}
