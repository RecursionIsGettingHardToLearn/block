import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateNodeDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[\w.-]+:\d+$/, {
    message: 'endpoint debe tener formato host:puerto (ej: localhost:7051)',
  })
  endpoint: string;

  @IsString()
  @IsNotEmpty()
  hostAlias: string;

  @IsBoolean()
  @IsOptional()
  activo?: boolean;
}
