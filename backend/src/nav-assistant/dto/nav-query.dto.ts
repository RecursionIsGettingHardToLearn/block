import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class NavTurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

/** Mensaje del usuario al asistente, con el historial previo para continuidad. */
export class NavQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  consulta: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NavTurnDto)
  historial?: NavTurnDto[];
}
